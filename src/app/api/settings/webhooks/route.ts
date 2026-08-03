import { NextResponse } from "next/server";
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import {
  encryptWebhookSecret,
  generateWebhookSecret,
} from "@/lib/webhooks/outbound";

/** GET /api/settings/webhooks — list endpoints (secret never returned). */
export async function GET() {
  try {
    const { accountId } = await requireRole("viewer");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .select("id, url, events, active, created_at, updated_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ endpoints: data ?? [] });
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      return toErrorResponse(err);
    }
    throw err;
  }
}

/** POST /api/settings/webhooks — create endpoint; returns plaintext secret once. */
export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole("admin");
    const body = await request.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url || !/^https:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "url must be an https URL" },
        { status: 400 },
      );
    }
    const events = Array.isArray(body?.events)
      ? body.events.map((e: unknown) => String(e))
      : ["message.status_updated", "message.received"];

    const secret = generateWebhookSecret();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .insert({
        account_id: accountId,
        url,
        secret_encrypted: encryptWebhookSecret(secret),
        events,
        active: true,
      })
      .select("id, url, events, active, created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ endpoint: data, secret }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      return toErrorResponse(err);
    }
    throw err;
  }
}
