import { supabaseAdmin } from '@/lib/flows/admin-client'
import {
  engineSendText,
  engineSendInteractiveButtons,
  engineSendInteractiveList,
} from '@/lib/flows/meta-send'
import type { InteractiveListSection } from '@/lib/whatsapp/meta-api'
import { log } from '@/lib/observability/logger'

type FlowNode = {
  node_key: string
  node_type: string
  config: Record<string, unknown>
}

type FlowRow = {
  id: string
  user_id: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  entry_node_id: string | null
  status: string
}

/**
 * Minimal conversational flow runner on migration 010 tables.
 * Starts keyword / first_inbound flows; advances on button/list replies
 * and free text for collect_input / send_message chains.
 */
export async function handleInboundFlowMessage(input: {
  accountId: string
  userId: string
  contactId: string
  conversationId: string
  messageText: string
  interactiveReplyId: string | null
  accessToken: string
  phoneNumberId: string
}): Promise<void> {
  const db = supabaseAdmin()

  // 1) Advance active run if present
  const { data: activeRun } = await db
    .from('flow_runs')
    .select('id, flow_id, current_node_key, vars, user_id, reprompt_count')
    .eq('contact_id', input.contactId)
    .eq('user_id', input.userId)
    .eq('status', 'active')
    .maybeSingle()

  if (activeRun) {
    await advanceRun(db, activeRun, input)
    return
  }

  // 2) Start a new run from matching active flow
  const { data: flows } = await db
    .from('flows')
    .select('id, user_id, trigger_type, trigger_config, entry_node_id, status')
    .eq('user_id', input.userId)
    .eq('status', 'active')

  for (const flow of (flows ?? []) as FlowRow[]) {
    if (!flow.entry_node_id) continue
    if (!flowMatches(flow, input.messageText, input.interactiveReplyId)) continue

    const { data: run, error } = await db
      .from('flow_runs')
      .insert({
        flow_id: flow.id,
        user_id: input.userId,
        contact_id: input.contactId,
        conversation_id: input.conversationId,
        status: 'active',
        current_node_key: flow.entry_node_id,
        vars: {},
      })
      .select('id, flow_id, current_node_key, vars, user_id, reprompt_count')
      .maybeSingle()

    if (error) {
      // Unique active-run collision — another webhook won.
      if ((error as { code?: string }).code === '23505') return
      log.warn('flow_run insert failed', { message: error.message })
      return
    }
    if (!run) return

    await db
      .from('flows')
      .update({
        last_executed_at: new Date().toISOString(),
      })
      .eq('id', flow.id)

    await executeFromNode(db, run, flow.id, flow.entry_node_id, input, true)
    return
  }
}

function flowMatches(
  flow: FlowRow,
  text: string,
  replyId: string | null,
): boolean {
  if (flow.trigger_type === 'first_inbound_message') return true
  if (flow.trigger_type === 'keyword') {
    const keywords = Array.isArray(flow.trigger_config?.keywords)
      ? (flow.trigger_config.keywords as string[])
      : []
    const matchType =
      flow.trigger_config?.match_type === 'exact' ? 'exact' : 'contains'
    const lower = text.toLowerCase()
    return keywords.some((k) => {
      const kw = String(k).toLowerCase()
      return matchType === 'exact' ? lower === kw : lower.includes(kw)
    })
  }
  if (flow.trigger_type === 'manual') return false
  void replyId
  return false
}

async function advanceRun(
  db: ReturnType<typeof supabaseAdmin>,
  run: {
    id: string
    flow_id: string
    current_node_key: string | null
    vars: Record<string, unknown>
    user_id: string
    reprompt_count: number
  },
  input: {
    accountId: string
    userId: string
    contactId: string
    conversationId: string
    messageText: string
    interactiveReplyId: string | null
    accessToken: string
    phoneNumberId: string
  },
): Promise<void> {
  if (!run.current_node_key) return
  const { data: node } = await db
    .from('flow_nodes')
    .select('node_key, node_type, config')
    .eq('flow_id', run.flow_id)
    .eq('node_key', run.current_node_key)
    .maybeSingle()
  if (!node) {
    await endRun(db, run.id, 'failed', 'missing_node')
    return
  }

  const cfg = (node.config ?? {}) as Record<string, unknown>
  let nextKey: string | null = null

  if (node.node_type === 'send_buttons' || node.node_type === 'send_list') {
    const buttons = Array.isArray(cfg.buttons) ? cfg.buttons : []
    const reply = input.interactiveReplyId ?? input.messageText.trim()
    const match = buttons.find(
      (b: { id?: string; next_node_key?: string }) =>
        String(b.id ?? '') === reply,
    ) as { next_node_key?: string } | undefined
    nextKey = match?.next_node_key ?? (cfg.default_next as string) ?? null
  } else if (node.node_type === 'collect_input') {
    const varName = String(cfg.var_name ?? 'input')
    const vars = { ...(run.vars ?? {}), [varName]: input.messageText }
    await db.from('flow_runs').update({ vars }).eq('id', run.id)
    nextKey = (cfg.next_node_key as string) ?? null
  } else if (node.node_type === 'start' || node.node_type === 'send_message') {
    nextKey = (cfg.next_node_key as string) ?? null
  } else if (node.node_type === 'handoff' || node.node_type === 'end') {
    await endRun(
      db,
      run.id,
      node.node_type === 'handoff' ? 'handed_off' : 'completed',
      node.node_type,
    )
    return
  }

  if (!nextKey) {
    await endRun(db, run.id, 'completed', 'no_next')
    return
  }

  await db
    .from('flow_runs')
    .update({
      current_node_key: nextKey,
      last_advanced_at: new Date().toISOString(),
    })
    .eq('id', run.id)

  await executeFromNode(db, { ...run, current_node_key: nextKey }, run.flow_id, nextKey, input, false)
}

async function executeFromNode(
  db: ReturnType<typeof supabaseAdmin>,
  run: {
    id: string
    flow_id: string
    current_node_key: string | null
    vars: Record<string, unknown>
    user_id: string
  },
  flowId: string,
  nodeKey: string,
  input: {
    accountId: string
    userId: string
    contactId: string
    conversationId: string
    messageText: string
    interactiveReplyId: string | null
    accessToken: string
    phoneNumberId: string
  },
  autoChain: boolean,
): Promise<void> {
  const { data: node } = await db
    .from('flow_nodes')
    .select('node_key, node_type, config')
    .eq('flow_id', flowId)
    .eq('node_key', nodeKey)
    .maybeSingle()

  if (!node) {
    await endRun(db, run.id, 'failed', 'missing_node')
    return
  }

  const cfg = (node.config ?? {}) as Record<string, unknown>
  const n = node as FlowNode

  try {
    if (n.node_type === 'start') {
      const next = (cfg.next_node_key as string) ?? null
      if (next && autoChain) {
        await db
          .from('flow_runs')
          .update({ current_node_key: next })
          .eq('id', run.id)
        await executeFromNode(db, run, flowId, next, input, true)
      }
      return
    }

    if (n.node_type === 'send_message') {
      const text = interpolate(String(cfg.text ?? ''), run.vars ?? {})
      await engineSendText({
        accountId: input.accountId,
        userId: input.userId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        text,
      })
      const next = (cfg.next_node_key as string) ?? null
      if (next && autoChain) {
        await db
          .from('flow_runs')
          .update({
            current_node_key: next,
            last_advanced_at: new Date().toISOString(),
          })
          .eq('id', run.id)
        await executeFromNode(db, run, flowId, next, input, true)
      } else if (!next) {
        await endRun(db, run.id, 'completed', 'end')
      }
      return
    }

    if (n.node_type === 'send_buttons') {
      const text = String(cfg.body ?? cfg.text ?? 'Choose an option')
      const buttons = (Array.isArray(cfg.buttons) ? cfg.buttons : []).slice(
        0,
        3,
      ) as { id: string; title: string }[]
      await engineSendInteractiveButtons({
        accountId: input.accountId,
        userId: input.userId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        bodyText: text,
        buttons: buttons.map((b) => ({
          id: b.id,
          title: b.title.slice(0, 20),
        })),
      })
      return
    }

    if (n.node_type === 'send_list') {
      const text = String(cfg.body ?? cfg.text ?? 'Choose an option')
      const sections = Array.isArray(cfg.sections)
        ? (cfg.sections as InteractiveListSection[])
        : []
      if (sections.length) {
        await engineSendInteractiveList({
          accountId: input.accountId,
          userId: input.userId,
          conversationId: input.conversationId,
          contactId: input.contactId,
          bodyText: text,
          buttonLabel: String(cfg.button_label ?? 'Options'),
          sections,
        })
      }
      return
    }

    if (n.node_type === 'collect_input') {
      const prompt = interpolate(
        String(cfg.prompt ?? cfg.text ?? 'Please reply:'),
        run.vars ?? {},
      )
      await engineSendText({
        accountId: input.accountId,
        userId: input.userId,
        conversationId: input.conversationId,
        contactId: input.contactId,
        text: prompt,
      })
      return
    }

    if (n.node_type === 'set_tag') {
      const tagId = String(cfg.tag_id ?? '')
      if (tagId) {
        const { addContactTagIfAbsent } = await import(
          '@/lib/contacts/tag-write'
        )
        await addContactTagIfAbsent(db, {
          accountId: input.accountId,
          contactId: input.contactId,
          tagId,
        })
      }
      const next = (cfg.next_node_key as string) ?? null
      if (next) {
        await db
          .from('flow_runs')
          .update({ current_node_key: next })
          .eq('id', run.id)
        await executeFromNode(db, run, flowId, next, input, true)
      } else {
        await endRun(db, run.id, 'completed', 'set_tag')
      }
      return
    }

    if (n.node_type === 'handoff') {
      await endRun(db, run.id, 'handed_off', 'handoff')
      return
    }

    if (n.node_type === 'end') {
      await endRun(db, run.id, 'completed', 'end')
      return
    }
  } catch (err) {
    log.warn('flow node execute failed', {
      node: nodeKey,
      message: err instanceof Error ? err.message : String(err),
    })
    await endRun(db, run.id, 'failed', 'execute_error')
  }
}

function interpolate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
    String(vars[k] ?? ''),
  )
}

async function endRun(
  db: ReturnType<typeof supabaseAdmin>,
  runId: string,
  status: string,
  reason: string,
): Promise<void> {
  await db
    .from('flow_runs')
    .update({
      status,
      ended_at: new Date().toISOString(),
      end_reason: reason,
    })
    .eq('id', runId)
}
