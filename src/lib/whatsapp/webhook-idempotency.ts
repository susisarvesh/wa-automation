import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookEventType = "message" | "status" | "template";

/**
 * Claim a webhook event for processing. Returns false if already seen
 * (unique violation) — caller must skip side effects.
 */
export async function claimWebhookEvent(
  admin: SupabaseClient,
  input: {
    accountId: string | null;
    phoneNumberId: string;
    wamid: string;
    eventType: WebhookEventType;
  },
): Promise<boolean> {
  if (!input.wamid || !input.phoneNumberId) return true;

  const { error } = await admin.from("webhook_events").insert({
    account_id: input.accountId,
    phone_number_id: input.phoneNumberId,
    wamid: input.wamid,
    event_type: input.eventType,
  });

  if (!error) return true;

  // Unique violation → already processed
  if (error.code === "23505") return false;

  // Table missing / other — fail open once with warn so deploys
  // without migration don't drop messages, but log loudly.
  console.warn("[webhook_events] claim failed:", error.message);
  return true;
}
