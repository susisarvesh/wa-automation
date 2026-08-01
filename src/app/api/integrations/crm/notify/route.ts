import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { isValidE164, sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils'
import { resolveWhatsAppConfig } from '@/lib/whatsapp/resolve-config'
import { log } from '@/lib/observability/logger'

type CrmEvent = 'ticket.created' | 'ticket.status_changed' | 'ticket.closed'

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function authorize(request: Request): boolean {
  const secret = process.env.CRM_WA_SHARED_SECRET?.trim()
  if (!secret) return false
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const alt = request.headers.get('x-crm-wa-secret')?.trim() || ''
  return (
    (token.length > 0 && timingSafeEqual(token, secret)) ||
    (alt.length > 0 && timingSafeEqual(alt, secret))
  )
}

function templateForEvent(event: CrmEvent): string | null {
  switch (event) {
    case 'ticket.created':
      return process.env.CRM_WA_TEMPLATE_CREATED?.trim() || null
    case 'ticket.status_changed':
      return process.env.CRM_WA_TEMPLATE_STATUS?.trim() || null
    case 'ticket.closed':
      return process.env.CRM_WA_TEMPLATE_CLOSED?.trim() || null
    default:
      return null
  }
}

function bodyParamsForEvent(
  event: CrmEvent,
  payload: {
    customer_name?: string
    ticket_id: string
    status?: string
    title?: string
  },
): string[] {
  const name = (payload.customer_name || 'Customer').slice(0, 60)
  const ticketId = payload.ticket_id.slice(0, 60)
  const title = (payload.title || 'Support request').slice(0, 60)
  const status = (payload.status || '').slice(0, 60)

  // Convention for Meta templates:
  // created / closed: {{1}} name, {{2}} ticket id, {{3}} title
  // status: {{1}} name, {{2}} ticket id, {{3}} status, {{4}} title
  if (event === 'ticket.status_changed') {
    return [name, ticketId, status || 'Updated', title]
  }
  return [name, ticketId, title]
}

/**
 * CRM → WhatsApp bridge.
 * Auth: Authorization: Bearer ${CRM_WA_SHARED_SECRET}
 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accountId = process.env.CRM_WA_ACCOUNT_ID?.trim()
  if (!accountId) {
    return NextResponse.json(
      { error: 'CRM_WA_ACCOUNT_ID is not configured' },
      { status: 503 },
    )
  }

  let body: {
    event?: string
    ticket_id?: string
    status?: string
    title?: string
    customer_phone?: string
    customer_name?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = body.event as CrmEvent
  if (
    event !== 'ticket.created' &&
    event !== 'ticket.status_changed' &&
    event !== 'ticket.closed'
  ) {
    return NextResponse.json({ error: 'Unsupported event' }, { status: 400 })
  }

  const ticketId =
    typeof body.ticket_id === 'string' ? body.ticket_id.trim() : ''
  if (!ticketId) {
    return NextResponse.json({ error: 'ticket_id is required' }, { status: 400 })
  }

  const phoneRaw =
    typeof body.customer_phone === 'string' ? body.customer_phone.trim() : ''
  const phone = phoneRaw ? sanitizePhoneForMeta(phoneRaw) : ''
  if (!phone || !isValidE164(phoneRaw.startsWith('+') ? phoneRaw : `+${phone}`)) {
    return NextResponse.json(
      { error: 'customer_phone must be a valid E.164 number' },
      { status: 400 },
    )
  }

  const templateName = templateForEvent(event)
  if (!templateName) {
    return NextResponse.json(
      {
        error: `No template configured for ${event}. Set CRM_WA_TEMPLATE_* env vars.`,
      },
      { status: 503 },
    )
  }

  const language = process.env.CRM_WA_TEMPLATE_LANG?.trim() || 'en_US'
  const admin = supabaseAdmin()
  const config = await resolveWhatsAppConfig(admin, accountId)
  if (!config?.phone_number_id || !config.access_token) {
    return NextResponse.json(
      { error: 'WhatsApp is not configured for the CRM account' },
      { status: 503 },
    )
  }

  const accessToken = decrypt(config.access_token)
  const params = bodyParamsForEvent(event, {
    customer_name: body.customer_name,
    ticket_id: ticketId,
    status: body.status,
    title: body.title,
  })

  try {
    const result = await sendTemplateMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: phone,
      templateName,
      language,
      params,
      messageParams: { body: params },
    })
    log.info('crm whatsapp notify sent', {
      event,
      ticketId,
      messageId: result.messageId,
    })
    return NextResponse.json({
      success: true,
      message_id: result.messageId,
      template: templateName,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.warn('crm whatsapp notify failed', { event, ticketId, error: message })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
