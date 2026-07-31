import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import type { AutomationLogStepResult } from "@/types";

export type AutomationStats = {
  runs: number;
  sent: number;
  failed: number;
  replied: number;
};

/**
 * GET /api/automations/stats
 *
 * Live delivery stats per automation for the current account:
 *   - runs: automation_logs rows
 *   - sent: runs where a send_message step succeeded
 *   - failed: runs with status failed, or a failed send_message step
 *   - replied: runs that sent, then got a customer message after the log
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireRole("viewer");
  } catch (err) {
    return toErrorResponse(err);
  }

  const admin = supabaseAdmin();

  const { data: logs, error } = await admin
    .from("automation_logs")
    .select("id, automation_id, contact_id, status, steps_executed, created_at")
    .eq("account_id", ctx.accountId)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byAutomation = new Map<string, AutomationStats>();
  const ensure = (id: string): AutomationStats => {
    let s = byAutomation.get(id);
    if (!s) {
      s = { runs: 0, sent: 0, failed: 0, replied: 0 };
      byAutomation.set(id, s);
    }
    return s;
  };

  type LogRow = {
    id: string;
    automation_id: string;
    contact_id: string | null;
    status: string;
    steps_executed: AutomationLogStepResult[] | null;
    created_at: string;
  };

  const sentCandidates: LogRow[] = [];

  for (const raw of (logs ?? []) as LogRow[]) {
    const s = ensure(raw.automation_id);
    s.runs += 1;

    const steps = Array.isArray(raw.steps_executed) ? raw.steps_executed : [];
    const sendOk = steps.some(
      (st) => st.step_type === "send_message" && st.status === "success",
    );
    const sendFail = steps.some(
      (st) => st.step_type === "send_message" && st.status === "failed",
    );

    if (sendOk) {
      s.sent += 1;
      if (raw.contact_id) sentCandidates.push(raw);
    }
    if (raw.status === "failed" || sendFail) {
      s.failed += 1;
    }
  }

  // Replied: customer message after a successful bot send for that contact.
  if (sentCandidates.length > 0) {
    const contactIds = [
      ...new Set(sentCandidates.map((l) => l.contact_id!).filter(Boolean)),
    ];

    const { data: conversations } = await admin
      .from("conversations")
      .select("id, contact_id")
      .eq("account_id", ctx.accountId)
      .in("contact_id", contactIds);

    const convByContact = new Map<string, string[]>();
    for (const c of conversations ?? []) {
      const list = convByContact.get(c.contact_id as string) ?? [];
      list.push(c.id as string);
      convByContact.set(c.contact_id as string, list);
    }

    const allConvIds = [...new Set([...(conversations ?? [])].map((c) => c.id))];
    if (allConvIds.length > 0) {
      const earliest = sentCandidates.reduce(
        (min, l) => (l.created_at < min ? l.created_at : min),
        sentCandidates[0].created_at,
      );

      const { data: customerMsgs } = await admin
        .from("messages")
        .select("conversation_id, created_at")
        .eq("sender_type", "customer")
        .in("conversation_id", allConvIds)
        .gte("created_at", earliest)
        .order("created_at", { ascending: true })
        .limit(5000);

      const msgsByConv = new Map<string, string[]>();
      for (const m of customerMsgs ?? []) {
        const list = msgsByConv.get(m.conversation_id as string) ?? [];
        list.push(m.created_at as string);
        msgsByConv.set(m.conversation_id as string, list);
      }

      const repliedLogIds = new Set<string>();
      for (const log of sentCandidates) {
        if (!log.contact_id) continue;
        const convIds = convByContact.get(log.contact_id) ?? [];
        const replied = convIds.some((cid) =>
          (msgsByConv.get(cid) ?? []).some((at) => at > log.created_at),
        );
        if (replied) repliedLogIds.add(log.id);
      }

      for (const log of sentCandidates) {
        if (repliedLogIds.has(log.id)) {
          ensure(log.automation_id).replied += 1;
        }
      }
    }
  }

  const stats: Record<string, AutomationStats> = {};
  for (const [id, s] of byAutomation) stats[id] = s;

  return NextResponse.json({ stats });
}
