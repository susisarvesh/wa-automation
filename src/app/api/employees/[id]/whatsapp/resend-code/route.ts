import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { humanizeMetaError } from "@/lib/whatsapp/meta-errors";
import { requestPhoneVerificationCode } from "@/lib/whatsapp/meta-api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/employees/[id]/whatsapp/resend-code
 * Re-request SMS OTP for a pending employee WhatsApp line.
 */
export async function POST(_request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id: employeeId } = await params;
  const admin = supabaseAdmin();

  const { data: config } = await admin
    .from("whatsapp_config")
    .select("id, phone_number_id, access_token, status")
    .eq("account_id", ctx.accountId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (!config?.phone_number_id) {
    return NextResponse.json(
      { error: "Start WhatsApp setup for this employee first." },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(config.access_token);
  } catch {
    return NextResponse.json(
      { error: "Stored token cannot be decrypted." },
      { status: 400 },
    );
  }

  try {
    await requestPhoneVerificationCode({
      phoneNumberId: config.phone_number_id,
      accessToken,
      codeMethod: "SMS",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: humanizeMetaError(message),
        detail: message,
        tip: "Meta rate-limits OTP resends — wait a minute and try again.",
      },
      { status: 400 },
    );
  }

  if (config.status !== "pending_verification") {
    await admin
      .from("whatsapp_config")
      .update({
        status: "pending_verification",
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);
  }

  return NextResponse.json({
    ok: true,
    message: "SMS code resent. Check the employee’s phone.",
  });
}
