import { isLikelyMetaSampleTemplateName } from '@/lib/whatsapp/meta-errors'

/**
 * Pick a Meta-legal template name when cloning an immutable sample.
 * Keeps lowercase / underscore rules from Meta's name regex.
 */
export function nextCloneTemplateName(
  preferred: string,
  existingNames: Iterable<string>,
): string {
  const taken = new Set(
    [...existingNames].map((n) => n.trim().toLowerCase()).filter(Boolean),
  )

  let base = preferred
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 480)

  if (!base || isLikelyMetaSampleTemplateName(base)) {
    base = base && !isLikelyMetaSampleTemplateName(base) ? base : 'my_template'
    if (isLikelyMetaSampleTemplateName(preferred)) {
      const stripped = preferred
        .trim()
        .toLowerCase()
        .replace(/^jaspers_/, '')
        .replace(/^sample_/, '')
        .replace(/_sample$/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
      base = stripped ? `vsmart_${stripped}`.slice(0, 480) : 'vsmart_template'
    }
  }

  if (!taken.has(base) && !isLikelyMetaSampleTemplateName(base)) return base

  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}_v${i}`.slice(0, 512)
    if (!taken.has(candidate)) return candidate
  }
  return `${base}_${Date.now().toString(36)}`.slice(0, 512)
}
