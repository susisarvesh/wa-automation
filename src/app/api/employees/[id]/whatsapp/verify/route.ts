import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { ensureCompanyServicesAutomations } from "@/lib/employees/ensure-services-automations";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { humanizeMetaError } from "@/lib/whatsapp/meta-errors";
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
  verifyPhoneVerificationCode,
} from "@/lib/whatsapp/meta-api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/employees/[id]/whatsapp/verify
 * Body: { code: string, pin: string }
 */
export async function POST(request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id: employeeId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code =
    typeof body.code === "string" ? body.code.replace(/\D/g, "").trim() : "";
  const pin =
    typeof body.pin === "string" ? body.pin.replace(/\D/g, "").trim() : "";

  if (!/^\d{4,8}$/.test(code)) {
    return NextResponse.json(
      { error: "Enter the SMS verification code from Meta" },
      { status: 400 },
    );
  }
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      {
        error:
          "Enter a 6-digit PIN for WhatsApp two-step verification (you choose it; save it).",
      },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("*")
    .eq("account_id", ctx.accountId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (!config?.phone_number_id) {
    return NextResponse.json(
      {
        error:
          "Start WhatsApp setup for this employee first (send SMS code).",
      },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(config.access_token);
  } catch {
    return NextResponse.json(
      { error: "Stored token cannot be decrypted. Re-connect on Connect." },
      { status: 400 },
    );
  }

  try {
    await verifyPhoneVerificationCode({
      phoneNumberId: config.phone_number_id,
      accessToken,
      code,
    });
    await registerPhoneNumber({
      phoneNumberId: config.phone_number_id,
      accessToken,
      pin,
    });
    if (config.waba_id) {
      try {
        await subscribeWabaToApp({
          wabaId: config.waba_id,
          accessToken,
        });
      } catch {
        // non-fatal; primary WABA is usually already subscribed
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("whatsapp_config")
      .update({
        last_registration_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);
    return NextResponse.json(
      { error: humanizeMetaError(message), detail: message },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("whatsapp_config")
    .update({
      status: "connected",
      registered_at: now,
      connected_at: now,
      subscribed_apps_at: config.subscribed_apps_at ?? now,
      last_registration_error: null,
      updated_at: now,
    })
    .eq("id", config.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  try {
    await ensureCompanyServicesAutomations({
      accountId: ctx.accountId,
      userId: ctx.userId,
    });
  } catch (err) {
    console.error("[employee whatsapp verify] automations:", err);
  }

  let display: string | null = null;
  try {
    const info = await verifyPhoneNumber({
      phoneNumberId: config.phone_number_id,
      accessToken,
    });
    display = info.display_phone_number ?? null;
  } catch {
    display = null;
  }

  return NextResponse.json({
    ok: true,
    phone_number_id: config.phone_number_id,
    display_phone_number: display,
    message: display
      ? `WhatsApp connected. Customers should message ${display}. Send “Hi” to test automations.`
      : "WhatsApp connected. Customers should message this employee’s business line. Send “Hi” to test.",
    how_to_test: display
      ? `From another phone, WhatsApp ${display} with “Hi”.`
      : "From another phone, WhatsApp the new business line with “Hi”.",
  });
}
