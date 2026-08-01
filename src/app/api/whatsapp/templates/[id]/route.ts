import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireGranted,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  deleteMessageTemplate,
  editMessageTemplate,
  submitMessageTemplate,
} from '@/lib/whatsapp/meta-api'
import {
  isLikelyMetaSampleTemplateName,
  isMetaSampleTemplateError,
} from '@/lib/whatsapp/meta-errors'
import { nextCloneTemplateName } from '@/lib/whatsapp/meta-sample-templates'
import {
  validateTemplatePayload,
  type TemplatePayload,
} from '@/lib/whatsapp/template-validators'
import { buildMetaTemplatePayload } from '@/lib/whatsapp/template-components'
import { ensureMediaHeaderHandle } from '@/lib/whatsapp/template-header-handle'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Per-template lifecycle endpoint.
 *
 * PATCH  — edit on Meta (re-review). Meta sample templates (#100/2388094)
 *          cannot be edited, so we create a new writable copy instead.
 *
 * DELETE — remove on Meta when possible; sample templates are always
 *          removed locally even when Meta refuses.
 */

const EDITABLE_STATUSES = new Set(['APPROVED', 'REJECTED', 'PAUSED', 'DRAFT'])

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isDryRun(): boolean {
  return (
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === 'true' ||
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === '1'
  )
}

async function cloneAsNewTemplate(args: {
  supabase: SupabaseClient
  accountId: string
  userId: string
  accessToken: string
  wabaId: string
  payload: TemplatePayload
  existingName: string
}) {
  const { supabase, accountId, userId, accessToken, wabaId, payload } = args

  const { data: nameRows } = await supabase
    .from('message_templates')
    .select('name')
    .eq('account_id', accountId)

  const cloneName = nextCloneTemplateName(
    payload.name || args.existingName,
    (nameRows ?? []).map((r) => r.name as string),
  )
  const clonePayload: TemplatePayload = { ...payload, name: cloneName }

  if (!isDryRun()) {
    await ensureMediaHeaderHandle(clonePayload, accessToken)
  }

  let metaTemplateId: string
  let metaStatus: string
  if (isDryRun()) {
    metaTemplateId = `dry-run-${crypto.randomUUID()}`
    metaStatus = 'PENDING'
  } else {
    const meta = await submitMessageTemplate({
      wabaId,
      accessToken,
      payload: buildMetaTemplatePayload(clonePayload),
    })
    metaTemplateId = meta.id
    metaStatus = meta.status
  }

  const { data: row, error: insErr } = await supabase
    .from('message_templates')
    .insert({
      account_id: accountId,
      user_id: userId,
      name: clonePayload.name,
      category: clonePayload.category,
      language: clonePayload.language,
      header_type: clonePayload.header_type ?? null,
      header_content: clonePayload.header_content ?? null,
      header_media_url: clonePayload.header_media_url ?? null,
      header_handle: clonePayload.header_handle ?? null,
      body_text: clonePayload.body_text,
      footer_text: clonePayload.footer_text ?? null,
      buttons: clonePayload.buttons ?? null,
      sample_values: clonePayload.sample_values ?? null,
      status: normalizeStatus(metaStatus),
      meta_template_id: metaTemplateId,
      submission_error: null,
      rejection_reason: null,
      last_submitted_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insErr) {
    throw new Error(
      `Created on Meta as "${cloneName}" but failed to save locally: ${insErr.message}. Run Sync from Meta.`,
    )
  }

  return { row, cloneName }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 },
      )
    }

    const { supabase, accountId, userId } = await requireGranted('admin')

    let payload: TemplatePayload
    try {
      payload = (await request.json()) as TemplatePayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const { data: existing, error: lookupErr } = await supabase
      .from('message_templates')
      .select('id, name, status, meta_template_id, language')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (lookupErr || !existing) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
    }

    if (!existing.meta_template_id) {
      return NextResponse.json(
        {
          error:
            'This template was never submitted to Meta — use New Template to submit it instead.',
        },
        { status: 400 },
      )
    }

    if (!EDITABLE_STATUSES.has(existing.status)) {
      return NextResponse.json(
        {
          error: `Templates in status ${existing.status} cannot be edited. Allowed: APPROVED, REJECTED, PAUSED, DRAFT.`,
        },
        { status: 400 },
      )
    }

    if (payload.category === 'Authentication') {
      return NextResponse.json(
        {
          error:
            'AUTHENTICATION templates are not editable here — manage them in Meta WhatsApp Manager.',
        },
        { status: 400 },
      )
    }

    const isSample = isLikelyMetaSampleTemplateName(existing.name)
    if (!isSample) {
      // Name/language are immutable on Meta for real templates.
      payload.name = existing.name
      payload.language = existing.language || payload.language
    }

    try {
      validateTemplatePayload(payload)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Validation failed.' },
        { status: 400 },
      )
    }

    const { resolveWhatsAppConfig } = await import(
      '@/lib/whatsapp/resolve-config'
    )
    const config = await resolveWhatsAppConfig(supabase, accountId)
    if (!isDryRun() && (!config || !config.waba_id)) {
      return NextResponse.json(
        { error: 'WhatsApp not configured.' },
        { status: 400 },
      )
    }
    const accessToken = config ? decrypt(config.access_token) : ''
    const wabaId = config?.waba_id ?? ''

    let cloneBecauseSample = isSample

    if (!cloneBecauseSample && !isDryRun()) {
      try {
        await ensureMediaHeaderHandle(payload, accessToken)
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error ? e.message : 'Header media upload failed.',
          },
          { status: 400 },
        )
      }

      try {
        await editMessageTemplate({
          metaTemplateId: existing.meta_template_id,
          accessToken,
          components: buildMetaTemplatePayload(payload).components,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Meta edit failed.'
        if (isMetaSampleTemplateError(message)) {
          cloneBecauseSample = true
        } else {
          await supabase
            .from('message_templates')
            .update({
              submission_error: message,
              last_submitted_at: new Date().toISOString(),
            })
            .eq('id', id)
          return NextResponse.json({ error: message }, { status: 502 })
        }
      }
    }

    if (cloneBecauseSample) {
      try {
        const { row, cloneName } = await cloneAsNewTemplate({
          supabase,
          accountId,
          userId,
          accessToken,
          wabaId,
          payload,
          existingName: existing.name,
        })
        return NextResponse.json({
          success: true,
          cloned: true,
          clone_name: cloneName,
          template: row,
          dry_run: isDryRun(),
          message:
            'Meta sample templates can’t be edited. Created your own copy and submitted it for approval.',
        })
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? e.message
                : 'Could not create a copy of this sample template.',
          },
          { status: 502 },
        )
      }
    }

    // Dry-run edit of a non-sample, or Meta edit succeeded.
    if (isDryRun() && !isSample) {
      // no Meta call
    }

    const { data: row, error: updErr } = await supabase
      .from('message_templates')
      .update({
        category: payload.category,
        header_type: payload.header_type ?? null,
        header_content: payload.header_content ?? null,
        header_media_url: payload.header_media_url ?? null,
        header_handle: payload.header_handle ?? null,
        body_text: payload.body_text,
        footer_text: payload.footer_text ?? null,
        buttons: payload.buttons ?? null,
        sample_values: payload.sample_values ?? null,
        status: 'PENDING',
        submission_error: null,
        rejection_reason: null,
        last_submitted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updErr) {
      return NextResponse.json(
        {
          error: `Edited on Meta but failed to save locally: ${updErr.message}. Run "Sync from Meta" to recover.`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      template: row,
      dry_run: isDryRun(),
    })
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      error instanceof ForbiddenError
    ) {
      return toErrorResponse(error)
    }
    console.error('Error editing template:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to edit template.',
      },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 },
      )
    }

    const { supabase, accountId } = await requireGranted('admin')

    const { data: existing, error: lookupErr } = await supabase
      .from('message_templates')
      .select('id, name, meta_template_id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (lookupErr || !existing) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
    }

    let metaSkipped = false
    let metaSkipReason: string | undefined

    if (existing.meta_template_id && !isDryRun()) {
      const isSample = isLikelyMetaSampleTemplateName(existing.name)
      if (isSample) {
        // Skip Meta — samples refuse delete (#100/2388094).
        metaSkipped = true
        metaSkipReason = 'sample'
      } else {
        const { resolveWhatsAppConfig } = await import(
          '@/lib/whatsapp/resolve-config'
        )
        const config = await resolveWhatsAppConfig(supabase, accountId)
        if (!config || !config.waba_id) {
          return NextResponse.json(
            { error: 'WhatsApp not configured — cannot delete on Meta.' },
            { status: 400 },
          )
        }
        const accessToken = decrypt(config.access_token)
        try {
          await deleteMessageTemplate({
            wabaId: config.waba_id,
            accessToken,
            name: existing.name,
            metaTemplateId: existing.meta_template_id,
          })
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Meta delete failed.'
          if (isMetaSampleTemplateError(message)) {
            metaSkipped = true
            metaSkipReason = 'sample'
          } else {
            return NextResponse.json({ error: message }, { status: 502 })
          }
        }
      }
    }

    const { error: delErr } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', id)
    if (delErr) {
      return NextResponse.json(
        {
          error: metaSkipped
            ? `Failed to delete locally: ${delErr.message}.`
            : `Deleted on Meta but failed to delete locally: ${delErr.message}.`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      dry_run: isDryRun(),
      meta_skipped: metaSkipped,
      meta_skip_reason: metaSkipReason,
      message: metaSkipped
        ? 'Removed from this app. Meta sample templates stay in WhatsApp Manager.'
        : undefined,
    })
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      error instanceof ForbiddenError
    ) {
      return toErrorResponse(error)
    }
    console.error('Error deleting template:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to delete template.',
      },
      { status: 500 },
    )
  }
}
