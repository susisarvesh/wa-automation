import { createHmac, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "@/lib/whatsapp/encryption";
import { enqueueJob } from "@/lib/jobs/queue";
import { log } from "@/lib/observability/logger";

export type OutboundWebhookEvent =
  | "message.status_updated"
  | "message.received";

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

/**
 * Fan-out a signed event to all active webhook endpoints for the account.
 * Enqueues deliver jobs so Meta webhook latency stays low.
 */
export async function enqueueOutboundWebhooks(
  admin: SupabaseClient,
  accountId: string,
  eventType: OutboundWebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: endpoints, error } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret_encrypted, events")
    .eq("account_id", accountId)
    .eq("active", true);

  if (error) {
    log.warn("webhook_endpoints list failed", { message: error.message });
    return;
  }

  for (const ep of endpoints ?? []) {
    const events = (ep.events as string[]) ?? [];
    if (!events.includes(eventType) && !events.includes("*")) continue;

    const { data: delivery } = await admin
      .from("webhook_deliveries")
      .insert({
        endpoint_id: ep.id,
        account_id: accountId,
        event_type: eventType,
        payload: { type: eventType, data: payload },
        status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (!delivery?.id) continue;

    await enqueueJob(admin, {
      jobType: "webhook.deliver",
      accountId,
      payload: {
        deliveryId: delivery.id,
        endpointId: ep.id,
      },
      maxAttempts: 6,
    });
  }
}

export async function deliverOutboundWebhook(
  admin: SupabaseClient,
  deliveryId: string,
  endpointId: string,
): Promise<void> {
  const { data: delivery, error: dErr } = await admin
    .from("webhook_deliveries")
    .select("id, payload, attempts, status")
    .eq("id", deliveryId)
    .maybeSingle();
  if (dErr || !delivery) throw new Error("delivery not found");
  if (delivery.status === "delivered") return;

  const { data: endpoint, error: eErr } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret_encrypted, active")
    .eq("id", endpointId)
    .maybeSingle();
  if (eErr || !endpoint?.active) {
    throw new Error("endpoint missing or inactive");
  }

  const secret = decrypt(endpoint.secret_encrypted as string);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(delivery.payload);
  const signature = signWebhookPayload(secret, timestamp, body);

  const res = await fetch(endpoint.url as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wacrm-Timestamp": timestamp,
      "X-Wacrm-Signature": signature,
      "User-Agent": "Vsmart-WhatsApp-Studio/1.0",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await admin
      .from("webhook_deliveries")
      .update({
        attempts: (delivery.attempts as number) + 1,
        last_error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
      })
      .eq("id", deliveryId);
    throw new Error(`webhook deliver HTTP ${res.status}`);
  }

  await admin
    .from("webhook_deliveries")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      attempts: (delivery.attempts as number) + 1,
      last_error: null,
    })
    .eq("id", deliveryId);
}

export function encryptWebhookSecret(plain: string): string {
  return encrypt(plain);
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}
