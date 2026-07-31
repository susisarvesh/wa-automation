import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";
import { sendTemplateMessage } from "@/lib/whatsapp/meta-api";
import { sanitizePhoneForMeta, isValidE164 } from "@/lib/whatsapp/phone-utils";
import { enqueueJob } from "@/lib/jobs/queue";
import { log } from "@/lib/observability/logger";
import { isMessageTemplate } from "@/lib/whatsapp/template-row-guard";
import type { MessageTemplate } from "@/types";

const BATCH_SIZE = 25;
const DELAY_MS = 80;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Process one batch of pending recipients for a broadcast.
 * Re-enqueues another job if pending remain.
 */
export async function processBroadcastSendBatch(
  admin: SupabaseClient,
  broadcastId: string,
): Promise<{ sent: number; failed: number; remaining: number }> {
  const { data: broadcast, error: bErr } = await admin
    .from("broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .maybeSingle();

  if (bErr || !broadcast) {
    throw new Error(bErr?.message ?? "Broadcast not found");
  }

  if (broadcast.status !== "sending" && broadcast.status !== "scheduled") {
    // Already finished or draft — nothing to do
    return { sent: 0, failed: 0, remaining: 0 };
  }

  if (broadcast.status === "scheduled") {
    await admin
      .from("broadcasts")
      .update({
        status: "sending",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);
  } else if (!broadcast.started_at) {
    await admin
      .from("broadcasts")
      .update({
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);
  }

  const accountId = broadcast.account_id as string;

  const { data: config, error: cErr } = await admin
    .from("whatsapp_config")
    .select("phone_number_id, access_token")
    .eq("account_id", accountId)
    .maybeSingle();

  if (cErr || !config?.phone_number_id || !config.access_token) {
    await admin
      .from("broadcasts")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);
    throw new Error("WhatsApp not configured for this account");
  }

  const accessToken = decrypt(config.access_token);

  const { data: templateRow } = await admin
    .from("message_templates")
    .select("*")
    .eq("account_id", accountId)
    .eq("name", broadcast.template_name)
    .eq("language", broadcast.template_language || "en_US")
    .maybeSingle();

  const template =
    templateRow && isMessageTemplate(templateRow)
      ? (templateRow as MessageTemplate)
      : null;

  const vars = (broadcast.template_variables ?? {}) as {
    body?: string[];
    params?: string[];
  };
  const bodyParams = vars.body ?? vars.params ?? [];

  const { data: recipients, error: rErr } = await admin
    .from("broadcast_recipients")
    .select("id, contact_id, contact:contacts(id, phone)")
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (rErr) throw new Error(rErr.message);

  let sent = 0;
  let failed = 0;

  for (const rec of recipients ?? []) {
    const phoneRaw =
      (rec.contact as { phone?: string } | null)?.phone ?? null;
    const phone = phoneRaw ? sanitizePhoneForMeta(phoneRaw) : "";

    if (!phone || !isValidE164(phone)) {
      await admin
        .from("broadcast_recipients")
        .update({
          status: "failed",
          error_message: "Invalid or missing phone",
        })
        .eq("id", rec.id);
      failed += 1;
      continue;
    }

    try {
      const result = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: broadcast.template_name,
        language: broadcast.template_language || "en_US",
        template: template ?? undefined,
        params: bodyParams,
        messageParams: bodyParams.length ? { body: bodyParams } : undefined,
      });

      await admin
        .from("broadcast_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          whatsapp_message_id: result.messageId,
          error_message: null,
        })
        .eq("id", rec.id);
      sent += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await admin
        .from("broadcast_recipients")
        .update({
          status: "failed",
          error_message: msg.slice(0, 500),
        })
        .eq("id", rec.id);
      failed += 1;
      log.warn("broadcast recipient send failed", {
        broadcastId,
        recipientId: rec.id,
        error: msg,
      });
    }

    await sleep(DELAY_MS);
  }

  const { count: remaining } = await admin
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending");

  const left = remaining ?? 0;

  if (left > 0) {
    await enqueueJob(admin, {
      jobType: "broadcast.send_batch",
      accountId,
      payload: { broadcastId },
      runAt: new Date(Date.now() + 500),
    });
  } else {
    const { count: failCount } = await admin
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "failed");

    const { count: sentCount } = await admin
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .in("status", ["sent", "delivered", "read", "replied"]);

    const allFailed =
      (failCount ?? 0) > 0 && (sentCount ?? 0) === 0;

    await admin
      .from("broadcasts")
      .update({
        status: allFailed ? "failed" : "sent",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);
  }

  return { sent, failed, remaining: left };
}

/** Promote due scheduled campaigns into sending + enqueue. */
export async function promoteScheduledBroadcasts(
  admin: SupabaseClient,
): Promise<number> {
  const now = new Date().toISOString();
  const { data: due, error } = await admin
    .from("broadcasts")
    .select("id, account_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .limit(20);

  if (error || !due?.length) return 0;

  let n = 0;
  for (const row of due) {
    const { data: updated } = await admin
      .from("broadcasts")
      .update({
        status: "sending",
        started_at: now,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (!updated) continue;

    await enqueueJob(admin, {
      jobType: "broadcast.send_batch",
      accountId: row.account_id as string,
      payload: { broadcastId: row.id },
    });
    n += 1;
  }
  return n;
}
