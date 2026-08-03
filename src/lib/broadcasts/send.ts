import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";
import { sendTemplateMessage } from "@/lib/whatsapp/meta-api";
import { sanitizePhoneForMeta, isValidE164 } from "@/lib/whatsapp/phone-utils";
import { enqueueJob } from "@/lib/jobs/queue";
import { log } from "@/lib/observability/logger";
import { isMessageTemplate } from "@/lib/whatsapp/template-row-guard";
import type { MessageTemplate } from "@/types";
import {
  mergeButtonParams,
  mergeParamList,
  mergeParamString,
} from "@/lib/broadcasts/merge-params";
import type { SendTimeParams } from "@/lib/whatsapp/template-send-builder";

const BATCH_SIZE = 25;
const DELAY_MS = 80;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseTemplateVariables(raw: unknown): {
  body: string[];
  headerText?: string;
  buttonParams?: Record<number, string>;
} {
  const vars = (raw ?? {}) as {
    body?: string[];
    params?: string[];
    headerText?: string;
    buttonParams?: Record<string, string> | Record<number, string>;
  };
  const body = vars.body ?? vars.params ?? [];
  const buttonParams: Record<number, string> = {};
  if (vars.buttonParams && typeof vars.buttonParams === "object") {
    for (const [k, v] of Object.entries(vars.buttonParams)) {
      const idx = Number(k);
      if (Number.isFinite(idx)) buttonParams[idx] = String(v ?? "");
    }
  }
  return {
    body: body.map((p) => String(p ?? "")),
    headerText:
      typeof vars.headerText === "string" ? vars.headerText : undefined,
    buttonParams: Object.keys(buttonParams).length ? buttonParams : undefined,
  };
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
    // Cancelled, draft, sent, failed — stop.
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
      .eq("id", broadcastId)
      .eq("status", "scheduled");

    // Re-check — may have been cancelled between read and update.
    const { data: again } = await admin
      .from("broadcasts")
      .select("status")
      .eq("id", broadcastId)
      .maybeSingle();
    if (again?.status !== "sending") {
      return { sent: 0, failed: 0, remaining: 0 };
    }
  } else if (!broadcast.started_at) {
    await admin
      .from("broadcasts")
      .update({
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId)
      .eq("status", "sending");
  }

  const accountId = broadcast.account_id as string;

  const { resolveWhatsAppConfig } = await import(
    "@/lib/whatsapp/resolve-config"
  );
  const config = await resolveWhatsAppConfig(admin, accountId);

  if (!config?.phone_number_id || !config.access_token) {
    await admin
      .from("broadcasts")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId)
      .eq("status", "sending");
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

  const templateVars = parseTemplateVariables(broadcast.template_variables);

  const {
    loadAccountMessagingPolicy,
    isInQuietHours,
    countRecentBroadcastSends,
  } = await import("@/lib/broadcasts/messaging-policy");
  const policy = await loadAccountMessagingPolicy(admin, accountId);
  if (
    broadcast.respect_quiet_hours !== false &&
    isInQuietHours(policy)
  ) {
    // Defer — leave pending for next keepalive cycle.
    return { sent: 0, failed: 0, remaining: -1 };
  }
  const maxPerDay =
    typeof broadcast.max_per_contact_per_day === "number"
      ? (broadcast.max_per_contact_per_day as number)
      : policy.max_marketing_per_contact_per_day;

  const { data: recipients, error: rErr } = await admin
    .from("broadcast_recipients")
    .select("id, contact_id, contact:contacts(id, name, phone, company, email, whatsapp_opt_out, marketing_opt_out)")
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (rErr) throw new Error(rErr.message);

  let sent = 0;
  let failed = 0;

  for (const rec of recipients ?? []) {
    // Bail mid-batch if campaign was cancelled.
    const { data: live } = await admin
      .from("broadcasts")
      .select("status")
      .eq("id", broadcastId)
      .maybeSingle();
    if (live?.status !== "sending") {
      return { sent, failed, remaining: 0 };
    }

    const contact = rec.contact as {
      name?: string;
      phone?: string;
      company?: string;
      email?: string;
      whatsapp_opt_out?: boolean;
      marketing_opt_out?: boolean;
    } | null;

    if (
      broadcast.respect_opt_out !== false &&
      (contact?.whatsapp_opt_out || contact?.marketing_opt_out)
    ) {
      await admin
        .from("broadcast_recipients")
        .update({
          status: "failed",
          error_message: "Contact opted out",
        })
        .eq("id", rec.id);
      failed += 1;
      continue;
    }

    if (typeof maxPerDay === "number" && maxPerDay > 0 && rec.contact_id) {
      const recent = await countRecentBroadcastSends(
        admin,
        rec.contact_id as string,
      );
      if (recent >= maxPerDay) {
        await admin
          .from("broadcast_recipients")
          .update({
            status: "failed",
            error_message: "Frequency cap exceeded",
          })
          .eq("id", rec.id);
        failed += 1;
        continue;
      }
    }

    const phoneRaw = contact?.phone ?? null;
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

    const mergeContact = {
      name: contact?.name ?? null,
      phone: contact?.phone ?? phone,
      company: contact?.company ?? null,
      email: contact?.email ?? null,
    };
    const bodyParams = mergeParamList(templateVars.body, mergeContact);
    const headerText =
      templateVars.headerText !== undefined
        ? mergeParamString(templateVars.headerText, mergeContact)
        : undefined;
    const buttonParams = mergeButtonParams(
      templateVars.buttonParams,
      mergeContact,
    );

    const messageParams: SendTimeParams = {};
    if (bodyParams.length) messageParams.body = bodyParams;
    if (headerText !== undefined && headerText !== "") {
      messageParams.headerText = headerText;
    }
    if (buttonParams) messageParams.buttonParams = buttonParams;

    try {
      const result = await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: phone,
        templateName: broadcast.template_name,
        language: broadcast.template_language || "en_US",
        template: template ?? undefined,
        params: bodyParams,
        messageParams:
          Object.keys(messageParams).length > 0 ? messageParams : undefined,
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

  const { data: stillSending } = await admin
    .from("broadcasts")
    .select("status")
    .eq("id", broadcastId)
    .maybeSingle();
  if (stillSending?.status !== "sending") {
    return { sent, failed, remaining: 0 };
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

    const allFailed = (failCount ?? 0) > 0 && (sentCount ?? 0) === 0;

    await admin
      .from("broadcasts")
      .update({
        status: allFailed ? "failed" : "sent",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcastId)
      .eq("status", "sending");
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
