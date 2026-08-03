import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutomationsForTrigger } from "@/lib/automations/engine";
import type { TimeBasedTriggerConfig } from "@/types";
import { log } from "@/lib/observability/logger";

/**
 * Parse simple schedules:
 * - "HH:mm" daily in optional IANA timezone (default Asia/Kolkata)
 * - "0 9 * * *" cron-lite: minute hour only (daily)
 */
function shouldFireNow(
  schedule: string,
  timezone: string,
  now: Date,
  lastRunAt: string | null,
): boolean {
  const tz = timezone || "Asia/Kolkata";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const dayKey = `${get("year")}-${get("month")}-${get("day")}`;

  let targetH = -1;
  let targetM = -1;
  const hhmm = schedule.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    targetH = Number(hhmm[1]);
    targetM = Number(hhmm[2]);
  } else {
    const cron = schedule.trim().split(/\s+/);
    if (cron.length >= 2) {
      targetM = Number(cron[0]);
      targetH = Number(cron[1]);
    }
  }
  if (
    !Number.isFinite(targetH) ||
    !Number.isFinite(targetM) ||
    targetH < 0 ||
    targetH > 23 ||
    targetM < 0 ||
    targetM > 59
  ) {
    return false;
  }

  if (hour !== targetH || minute !== targetM) return false;
  if (lastRunAt) {
    const lastParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(lastRunAt));
    const lastDay = `${lastParts.find((p) => p.type === "year")?.value}-${lastParts.find((p) => p.type === "month")?.value}-${lastParts.find((p) => p.type === "day")?.value}`;
    if (lastDay === dayKey) return false;
  }
  return true;
}

/**
 * Run active time_based automations whose schedule matches "now".
 * Dispatches once per open conversation in the account (capped).
 */
export async function runDueTimeBasedAutomations(
  admin: SupabaseClient,
): Promise<{ fired: number }> {
  const { data: autos, error } = await admin
    .from("automations")
    .select("id, account_id, user_id, trigger_config, last_run_at, is_active")
    .eq("trigger_type", "time_based")
    .eq("is_active", true);

  if (error) {
    log.warn("time_based list failed", { message: error.message });
    return { fired: 0 };
  }

  const now = new Date();
  let fired = 0;

  for (const auto of autos ?? []) {
    const cfg = (auto.trigger_config ?? {}) as TimeBasedTriggerConfig;
    const schedule = String(cfg.schedule ?? "").trim();
    if (!schedule) continue;
    if (
      !shouldFireNow(
        schedule,
        cfg.timezone ?? "Asia/Kolkata",
        now,
        (auto.last_run_at as string) ?? null,
      )
    ) {
      continue;
    }

    const accountId = auto.account_id as string;
    const { data: convos } = await admin
      .from("conversations")
      .select("id, contact_id")
      .eq("account_id", accountId)
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(50);

    let runOk = true;
    let lastErr: string | null = null;

    for (const c of convos ?? []) {
      try {
        await runAutomationsForTrigger({
          accountId,
          triggerType: "time_based",
          contactId: c.contact_id as string,
          context: { conversation_id: c.id as string },
        });
        fired += 1;
      } catch (err) {
        runOk = false;
        lastErr = err instanceof Error ? err.message : String(err);
        log.warn("time_based run failed", {
          automationId: auto.id,
          message: lastErr,
        });
      }
    }

    await admin
      .from("automations")
      .update({
        last_run_at: now.toISOString(),
        last_run_status: runOk ? "success" : "partial",
        last_error: lastErr,
        updated_at: now.toISOString(),
      })
      .eq("id", auto.id);
  }

  return { fired };
}
