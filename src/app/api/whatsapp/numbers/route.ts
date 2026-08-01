import { NextResponse } from "next/server";
import {
  requireGranted,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt, encrypt } from "@/lib/whatsapp/encryption";
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from "@/lib/whatsapp/meta-api";
import { humanizeMetaError } from "@/lib/whatsapp/meta-errors";
import { resolveWhatsAppConfig } from "@/lib/whatsapp/resolve-config";

/** GET — list Meta phone numbers linked to this account. */
export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const { data, error } = await ctx.supabase
      .from("whatsapp_config")
      .select(
        "id, phone_number_id, waba_id, status, label, employee_id, is_primary, registered_at, connected_at, created_at",
      )
      .eq("account_id", ctx.accountId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ numbers: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST — add another Meta Cloud API phone number under this account.
 * Reuses the primary System User token by default (same WABA/app).
 * Body: { phone_number_id, label?, employee_id?, pin?, access_token?, waba_id? }
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phoneNumberId =
    typeof body.phone_number_id === "string" ? body.phone_number_id.trim() : "";
  if (!phoneNumberId) {
    return NextResponse.json(
      { error: "phone_number_id is required" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const primary = await resolveWhatsAppConfig(admin, ctx.accountId);
  if (!primary) {
    return NextResponse.json(
      {
        error:
          "Connect a primary WhatsApp number first (Connect page), then add more lines.",
      },
      { status: 400 },
    );
  }

  const { data: claimed } = await admin
    .from("whatsapp_config")
    .select("account_id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (claimed) {
    return NextResponse.json(
      {
        error:
          claimed.account_id === ctx.accountId
            ? "This phone number is already linked to your workspace"
            : "This phone number is linked to another workspace",
      },
      { status: 409 },
    );
  }

  let plainToken: string;
  if (typeof body.access_token === "string" && body.access_token.trim()) {
    plainToken = body.access_token.trim();
  } else {
    try {
      plainToken = decrypt(primary.access_token);
    } catch {
      return NextResponse.json(
        { error: "Could not reuse primary token — paste access_token" },
        { status: 400 },
      );
    }
  }

  const wabaId =
    (typeof body.waba_id === "string" && body.waba_id.trim()) ||
    primary.waba_id ||
    null;

  try {
    await verifyPhoneNumber({
      phoneNumberId,
      accessToken: plainToken,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: humanizeMetaError(message), detail: message },
      { status: 400 },
    );
  }

  let registeredAt: string | null = null;
  let registrationError: string | null = null;
  const pin =
    typeof body.pin === "string" && /^\d{6}$/.test(body.pin) ? body.pin : null;

  if (pin) {
    try {
      await registerPhoneNumber({
        phoneNumberId,
        accessToken: plainToken,
        pin,
      });
      registeredAt = new Date().toISOString();
    } catch (err) {
      registrationError =
        err instanceof Error ? err.message : "register failed";
    }
  }

  if (wabaId) {
    try {
      await subscribeWabaToApp({ wabaId, accessToken: plainToken });
    } catch {
      // non-fatal
    }
  }

  const { data: row, error } = await admin
    .from("whatsapp_config")
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      access_token: encrypt(plainToken),
      verify_token: primary.verify_token,
      status: registrationError ? "disconnected" : "connected",
      connected_at: registrationError ? null : new Date().toISOString(),
      registered_at: registeredAt,
      last_registration_error: registrationError,
      is_primary: false,
      label:
        typeof body.label === "string" && body.label.trim()
          ? body.label.trim()
          : null,
      employee_id:
        typeof body.employee_id === "string" && body.employee_id
          ? body.employee_id
          : null,
    })
    .select(
      "id, phone_number_id, waba_id, status, label, employee_id, is_primary, registered_at, connected_at",
    )
    .single();

  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      number: row,
      registration_error: registrationError,
    },
    { status: 201 },
  );
}
