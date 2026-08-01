import { NextResponse } from "next/server";
import {
  requireGranted,
  toErrorResponse,
} from "@/lib/auth/account";
import { runAutomationsForTrigger } from "@/lib/automations/engine";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { verifyPhoneNumber } from "@/lib/whatsapp/meta-api";
import {
  isValidE164,
  sanitizePhoneForMeta,
} from "@/lib/whatsapp/phone-utils";
import { resolveWhatsAppConfig } from "@/lib/whatsapp/resolve-config";

/**
 * POST /api/employees/test-automation
 * Proves services/FAQ automations can send without waiting for Meta inbound.
 * Body: { to: "+91…" } — recipient who should receive the auto-reply.
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => ({}));
  const rawTo = typeof body.to === "string" ? body.to.trim() : "";
  if (!rawTo) {
    return NextResponse.json(
      { error: "Enter a phone to receive the test reply (e.g. +919790985447)" },
      { status: 400 },
    );
  }

  const digits = sanitizePhoneForMeta(rawTo);
  const e164 = rawTo.startsWith("+") ? `+${digits}` : `+${digits}`;
  if (!isValidE164(e164)) {
    return NextResponse.json(
      { error: "Phone must be international format, e.g. +919790985447" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const config = await resolveWhatsAppConfig(admin, ctx.accountId);
  if (!config) {
    return NextResponse.json(
      { error: "Connect WhatsApp on the Connect page first." },
      { status: 400 },
    );
  }

  let businessDisplay: string | null = null;
  try {
    const info = await verifyPhoneNumber({
      phoneNumberId: config.phone_number_id,
      accessToken: decrypt(config.access_token),
    });
    businessDisplay = info.display_phone_number ?? null;
  } catch {
    // non-fatal for the send test
  }

  const contactPhone = digits; // stored without + like webhook normalize

  let contactId: string;
  const { data: existingContact } = await admin
    .from("contacts")
    .select("id")
    .eq("account_id", ctx.accountId)
    .eq("phone", contactPhone)
    .maybeSingle();

  if (existingContact) {
    contactId = existingContact.id as string;
  } else {
    const { data: created, error } = await admin
      .from("contacts")
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        phone: contactPhone,
        name: "Automation test",
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create contact" },
        { status: 500 },
      );
    }
    contactId = created.id as string;
  }

  let conversationId: string;
  const { data: existingConv } = await admin
    .from("conversations")
    .select("id")
    .eq("account_id", ctx.accountId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingConv) {
    conversationId = existingConv.id as string;
  } else {
    const { data: created, error } = await admin
      .from("conversations")
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        contact_id: contactId,
        phone_number_id: config.phone_number_id,
      })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json(
        { error: error?.message ?? "Could not create conversation" },
        { status: 500 },
      );
    }
    conversationId = created.id as string;
  }

  await runAutomationsForTrigger({
    accountId: ctx.accountId,
    triggerType: "keyword_match",
    contactId,
    context: {
      message_text: "hi",
      conversation_id: conversationId,
    },
  });

  const { data: logs } = await admin
    .from("automation_logs")
    .select("id, status, error_message, automation_id, created_at")
    .eq("account_id", ctx.accountId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(5);

  const failed = (logs ?? []).filter((l) => l.status === "failed");
  if (failed.length > 0 && (logs ?? []).every((l) => l.status === "failed")) {
    return NextResponse.json(
      {
        error:
          failed[0]?.error_message ||
          "Automation ran but Meta rejected the send",
        business_number: businessDisplay,
        logs,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Test auto-reply sent to ${e164}. Check WhatsApp on that phone.`,
    business_number: businessDisplay,
    tip: businessDisplay
      ? `For real customers: they must WhatsApp your company number ${businessDisplay} (not an employee’s personal phone).`
      : "For real customers: they must message your connected company Meta number, not a personal phone.",
    logs: logs ?? [],
  });
}
