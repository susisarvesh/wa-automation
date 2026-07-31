import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";
import { sendTextMessage } from "@/lib/whatsapp/meta-api";
import { humanizeMetaError } from "@/lib/whatsapp/meta-errors";

/**
 * POST /api/whatsapp/test-send
 *
 * Sends a free-form text to a phone via Meta Cloud API using saved
 * credentials — proves end-to-end delivery without an inbound trigger.
 *
 * Body: { to: string (E.164), text?: string }
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");
    const { supabase, accountId } = ctx;

    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
      text?: string;
    };

    const to = (body.to ?? "").replace(/[\s\-()]/g, "").trim();
    if (!/^\+?[1-9]\d{7,14}$/.test(to)) {
      return NextResponse.json(
        {
          error:
            "Enter a valid phone in international format, e.g. +919876543210",
        },
        { status: 400 },
      );
    }
    const recipient = to.startsWith("+") ? to.slice(1) : to;

    const text =
      (body.text ?? "").trim() ||
      "Test message from Vsmart WhatsApp Studio — Meta delivery works ✅";

    const { data: config, error: configError } = await supabase
      .from("whatsapp_config")
      .select("phone_number_id, access_token")
      .eq("account_id", accountId)
      .maybeSingle();

    if (configError || !config?.phone_number_id || !config.access_token) {
      return NextResponse.json(
        {
          error:
            "WhatsApp is not connected yet. Save Meta credentials on Connect first.",
        },
        { status: 400 },
      );
    }

    let accessToken: string;
    try {
      accessToken = decrypt(config.access_token);
    } catch {
      return NextResponse.json(
        {
          error:
            "Stored token cannot be decrypted. Reset Connect and paste a fresh access token.",
        },
        { status: 400 },
      );
    }

    try {
      const result = await sendTextMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: recipient,
        text,
      });
      return NextResponse.json({
        ok: true,
        message_id: result.messageId,
        to: recipient,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error("[whatsapp/test-send] Meta error:", raw);
      return NextResponse.json(
        { error: humanizeMetaError(raw), detail: raw },
        { status: 502 },
      );
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
