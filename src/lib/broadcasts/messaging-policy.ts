import type { SupabaseClient } from "@supabase/supabase-js";

export type MessagingPolicy = {
  quiet_hours?: {
    enabled?: boolean;
    start?: string; // "HH:mm"
    end?: string;
    timezone?: string;
  };
  max_marketing_per_contact_per_day?: number;
};

export function parseMessagingPolicy(raw: unknown): MessagingPolicy {
  if (!raw || typeof raw !== "object") return {};
  return raw as MessagingPolicy;
}

function minutesInTz(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function parseHm(s: string): number {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** True when current local time is inside quiet hours (should not send marketing). */
export function isInQuietHours(policy: MessagingPolicy, now = new Date()): boolean {
  const q = policy.quiet_hours;
  if (!q?.enabled) return false;
  const start = parseHm(q.start ?? "21:00");
  const end = parseHm(q.end ?? "08:00");
  if (start < 0 || end < 0) return false;
  const cur = minutesInTz(now, q.timezone || "Asia/Kolkata");
  if (start === end) return false;
  // Overnight window e.g. 21:00–08:00
  if (start > end) return cur >= start || cur < end;
  return cur >= start && cur < end;
}

export async function loadAccountMessagingPolicy(
  admin: SupabaseClient,
  accountId: string,
): Promise<MessagingPolicy> {
  const { data } = await admin
    .from("accounts")
    .select("messaging_policy")
    .eq("id", accountId)
    .maybeSingle();
  return parseMessagingPolicy(data?.messaging_policy);
}

/** Count outbound broadcast sends to a contact in the last 24h. */
export async function countRecentBroadcastSends(
  admin: SupabaseClient,
  contactId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .gte("created_at", since)
    .in("status", ["pending", "sent", "delivered", "read", "replied"]);
  return count ?? 0;
}
