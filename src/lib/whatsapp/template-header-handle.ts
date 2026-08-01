import { uploadResumableMedia } from '@/lib/whatsapp/meta-api'
import type { TemplatePayload } from '@/lib/whatsapp/template-validators'
import { isDeliverableUrl } from '@/lib/webhooks/ssrf'

/**
 * Meta requires an `example.header_handle` (from the Resumable Upload
 * API) to create/edit a template with a media header — a plain public
 * URL is not accepted at creation time. This helper turns the template's
 * `header_media_url` into a handle and writes it onto the payload.
 *
 * No-op unless the header is image/video/document with a URL and no
 * handle yet.
 */

type MediaHeaderType = 'image' | 'video' | 'document'

const MEDIA_RULES: Record<
  MediaHeaderType,
  { maxBytes: number; allowedTypes: string[]; label: string; defaultFile: string; defaultMime: string }
> = {
  image: {
    maxBytes: 5 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png'],
    label: 'Header image',
    defaultFile: 'header.jpg',
    defaultMime: 'image/jpeg',
  },
  video: {
    maxBytes: 16 * 1024 * 1024,
    allowedTypes: ['video/mp4', 'video/3gpp'],
    label: 'Header video',
    defaultFile: 'header.mp4',
    defaultMime: 'video/mp4',
  },
  document: {
    maxBytes: 100 * 1024 * 1024,
    // Bucket caps uploads at 16 MB; Meta allows up to 100 MB for template samples.
    allowedTypes: ['application/pdf'],
    label: 'Header document',
    defaultFile: 'header.pdf',
    defaultMime: 'application/pdf',
  },
}

function isMediaHeaderType(t: unknown): t is MediaHeaderType {
  return t === 'image' || t === 'video' || t === 'document'
}

function fileNameForMime(kind: MediaHeaderType, mime: string): string {
  if (kind === 'image') return mime === 'image/png' ? 'header.png' : 'header.jpg'
  if (kind === 'video') return mime === 'video/3gpp' ? 'header.3gp' : 'header.mp4'
  return 'header.pdf'
}

/**
 * Derive a Resumable Upload handle for image / video / document headers.
 * Mutates `payload.header_handle` on success.
 */
export async function ensureMediaHeaderHandle(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  if (!isMediaHeaderType(payload.header_type)) return
  if (payload.header_handle) return
  if (!payload.header_media_url) return

  const rules = MEDIA_RULES[payload.header_type]
  const appId = process.env.META_APP_ID
  if (!appId) {
    throw new Error(
      `${rules.label} templates need META_APP_ID set (used for Meta’s Resumable Upload). Add it to your environment, or remove the media header.`,
    )
  }

  if (!(await isDeliverableUrl(payload.header_media_url))) {
    throw new Error(
      `Could not fetch the ${rules.label.toLowerCase()} URL. Make sure it is publicly reachable.`,
    )
  }

  let res: Response
  try {
    res = await fetch(payload.header_media_url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error(
      `Could not fetch the ${rules.label.toLowerCase()} URL. Make sure it is publicly reachable.`,
    )
  }
  if (!res.ok) {
    throw new Error(
      `${rules.label} URL returned ${res.status}. It must be publicly reachable.`,
    )
  }

  const contentType = (res.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (contentType && !rules.allowedTypes.includes(contentType)) {
    throw new Error(
      `${rules.label} must be ${rules.allowedTypes.join(' or ')} (got ${contentType}).`,
    )
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new Error(`${rules.label} is empty.`)
  }
  if (bytes.byteLength > rules.maxBytes) {
    const mb = (bytes.byteLength / 1024 / 1024).toFixed(1)
    const limitMb = rules.maxBytes / 1024 / 1024
    throw new Error(
      `${rules.label} is ${mb} MB — Meta's limit is ${limitMb} MB.`,
    )
  }

  const mimeType = rules.allowedTypes.includes(contentType)
    ? contentType
    : rules.defaultMime
  const fileName = fileNameForMime(payload.header_type, mimeType)

  const { handle } = await uploadResumableMedia({
    appId,
    accessToken,
    fileName,
    mimeType,
    bytes,
  })
  payload.header_handle = handle
}

/** @deprecated Prefer {@link ensureMediaHeaderHandle}. Kept for callers/tests. */
export async function ensureImageHeaderHandle(
  payload: TemplatePayload,
  accessToken: string,
): Promise<void> {
  return ensureMediaHeaderHandle(payload, accessToken)
}
