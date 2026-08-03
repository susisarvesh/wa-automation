import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Look up a prior public-API response for Idempotency-Key.
 * Returns a NextResponse to replay, or null if this is a new key.
 */
export async function lookupIdempotentResponse(
  admin: SupabaseClient,
  accountId: string,
  key: string | null,
): Promise<NextResponse | null> {
  if (!key?.trim()) return null;
  const { data } = await admin
    .from("api_idempotency")
    .select("response_status, response_body")
    .eq("account_id", accountId)
    .eq("idempotency_key", key.trim().slice(0, 256))
    .maybeSingle();
  if (!data) return null;
  return NextResponse.json(data.response_body, {
    status: data.response_status as number,
  });
}

export async function storeIdempotentResponse(
  admin: SupabaseClient,
  accountId: string,
  key: string | null,
  requestHash: string | null,
  status: number,
  body: unknown,
): Promise<void> {
  if (!key?.trim()) return;
  await admin.from("api_idempotency").upsert(
    {
      account_id: accountId,
      idempotency_key: key.trim().slice(0, 256),
      request_hash: requestHash,
      response_status: status,
      response_body: body as object,
    },
    { onConflict: "account_id,idempotency_key" },
  );
}

export function hashRequestBody(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

export function getIdempotencyKey(request: Request): string | null {
  const h =
    request.headers.get("idempotency-key") ||
    request.headers.get("Idempotency-Key");
  return h?.trim() || null;
}
