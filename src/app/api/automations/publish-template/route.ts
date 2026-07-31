import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  applyAnswersToTemplate,
  getTemplate,
} from '@/lib/automations/templates'
import { insertSteps, type BuilderStepInput } from '@/lib/automations/steps-tree'
import {
  validateStepsForActivation,
  validateTriggerForActivation,
} from '@/lib/automations/validate'

/**
 * POST /api/automations/publish-template
 * Body: { slug, answers: Record<string,string> }
 * Creates + activates an automation from a library template.
 */
export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body?.slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const template = getTemplate(String(body.slug))
  if (!template) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 404 })
  }

  const answers = (body.answers ?? {}) as Record<string, string>
  const draft = applyAnswersToTemplate(template, answers)

  // Ensure Customer tag for welcome-style templates.
  if (template.needsCustomerTag) {
    const admin = supabaseAdmin()
    let tagId: string | null = null
    const { data: existing } = await admin
      .from('tags')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('name', 'Customer')
      .maybeSingle()
    if (existing?.id) {
      tagId = existing.id
    } else {
      const { data: created } = await admin
        .from('tags')
        .insert({
          account_id: ctx.accountId,
          user_id: ctx.userId,
          name: 'Customer',
          color: '#10b981',
        })
        .select('id')
        .single()
      tagId = created?.id ?? null
    }
    for (const step of draft.steps) {
      if (step.step_type === 'add_tag') {
        ;(step.step_config as { tag_id: string }).tag_id = tagId ?? ''
      }
    }
  }

  // Drop assign_conversation in single-tenant (no team) — replace with no-op by filtering.
  const steps = draft.steps.filter(
    (s) => s.step_type !== 'assign_conversation',
  ) as BuilderStepInput[]

  const issues = [
    ...validateTriggerForActivation(draft.trigger_type, draft.trigger_config ?? {}),
    ...validateStepsForActivation(
      steps as unknown as {
        step_type: string
        step_config: Record<string, unknown>
      }[],
    ),
  ]
  if (issues.length > 0) {
    return NextResponse.json(
      { error: 'Cannot publish — please complete all required fields', issues },
      { status: 400 },
    )
  }

  const admin = supabaseAdmin()
  const { data: automation, error: insertErr } = await admin
    .from('automations')
    .insert({
      user_id: ctx.userId,
      account_id: ctx.accountId,
      name: draft.name,
      description: draft.description,
      trigger_type: draft.trigger_type,
      trigger_config: draft.trigger_config ?? {},
      is_active: true,
    })
    .select()
    .single()

  if (insertErr || !automation) {
    return NextResponse.json(
      { error: insertErr?.message ?? 'Could not publish' },
      { status: 500 },
    )
  }

  if (steps.length > 0) {
    const err = await insertSteps(automation.id, steps)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ automation }, { status: 201 })
}
