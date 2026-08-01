import { NextResponse } from "next/server";
import { requireRole, requireGranted, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";
import {
  sendTemplateMessage,
  sendTextMessage,
} from "@/lib/whatsapp/meta-api";
import { humanizeMetaError } from "@/lib/whatsapp/meta-errors";

/**
 * POST /api/whatsapp/test-send
 *
 * Proves Meta delivery. Prefer the standard `hello_world` template —
 * free-form text only works inside the 24h window after the customer
 * messages you first (common reason for "accepted but never arrived").
 *
 * Body: { to: string (E.164), text?: string, use_template?: boolean }
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireGranted("admin");
    const { supabase, accountId } = ctx;

    const body = (await request.json().catch(() => ({}))) as {
      to?: string;
      text?: string;
      use_template?: boolean;
    };

    const to = (body.to ?? "").replace(/[\s\-()]/g, "").trim();
    if (!/^\+?[1-9]\d{7,14}$/.test(to)) {
      return NextResponse.json(
        {
          error:
            "Enter a valid phone in international format, e.g. +919790985447",
        },
        { status: 400 },
      );
    }
    const recipient = to.startsWith("+") ? to.slice(1) : to;

    const { resolveWhatsAppConfig } = await import(
      "@/lib/whatsapp/resolve-config"
    );
    const config = await resolveWhatsAppConfig(supabase, accountId);

    if (!config?.phone_number_id || !config.access_token) {
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

    const preferTemplate = body.use_template !== false;

    try {
      if (preferTemplate) {
        // Meta's default sample template — works for allowlisted test recipients
        // without an open customer-care window.
        const result = await sendTemplateMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: recipient,
          templateName: "hello_world",
          language: "en_US",
        });
        return NextResponse.json({
          ok: true,
          kind: "template",
          template: "hello_world",
          message_id: result.messageId,
          to: recipient,
        });
      }

      const text =
        (body.text ?? "").trim() ||
        "Test message from Vsmart WhatsApp Studio — Meta delivery works ✅";
      const result = await sendTextMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: recipient,
        text,
      });
      return NextResponse.json({
        ok: true,
        kind: "text",
        message_id: result.messageId,
        to: recipient,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      console.error("[whatsapp/test-send] Meta error:", raw);

      // If hello_world isn't available, fall back to free-form once.
      if (preferTemplate) {
        try {
          const text =
            (body.text ?? "").trim() ||
            "Test message from Vsmart WhatsApp Studio — Meta delivery works ✅";
          const result = await sendTextMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: recipient,
            text,
          });
          return NextResponse.json({
            ok: true,
            kind: "text",
            fallback_from_template_error: humanizeMetaError(raw),
            message_id: result.messageId,
            to: recipient,
          });
        } catch (textErr) {
          const textRaw =
            textErr instanceof Error ? textErr.message : String(textErr);
          return NextResponse.json(
            { error: humanizeMetaError(textRaw), detail: textRaw },
            { status: 502 },
          );
        }
      }

      return NextResponse.json(
        { error: humanizeMetaError(raw), detail: raw },
        { status: 502 },
      );
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
