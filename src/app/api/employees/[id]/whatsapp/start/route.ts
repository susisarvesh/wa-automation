import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { humanizeMetaError } from "@/lib/whatsapp/meta-errors";
import {
  createWabaPhoneNumber,
  listWabaPhoneNumbers,
  requestPhoneVerificationCode,
} from "@/lib/whatsapp/meta-api";
import { parseE164ToCcAndNational } from "@/lib/whatsapp/phone-utils";
import { resolveWhatsAppConfig } from "@/lib/whatsapp/resolve-config";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/employees/[id]/whatsapp/start
 * Create phone on connected WABA (if needed), request SMS OTP, save pending row.
 * Body: { verified_name?: string }
 */
export async function POST(request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id: employeeId } = await params;
  const body = await request.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const { data: employee } = await admin
    .from("employees")
    .select("id, name, phone, is_active")
    .eq("id", employeeId)
    .eq("account_id", ctx.accountId)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (!employee.is_active) {
    return NextResponse.json(
      { error: "Activate the employee before enabling WhatsApp" },
      { status: 400 },
    );
  }

  const parts = parseE164ToCcAndNational(employee.phone as string);
  if (!parts) {
    return NextResponse.json(
      {
        error:
          "Employee phone must be international E.164 (e.g. +919790985447)",
      },
      { status: 400 },
    );
  }

  const primary = await resolveWhatsAppConfig(admin, ctx.accountId);
  if (!primary?.waba_id) {
    return NextResponse.json(
      {
        error:
          "Connect a primary WhatsApp number with WABA ID on Connect first.",
      },
      { status: 400 },
    );
  }

  let accessToken: string;
  try {
    accessToken = decrypt(primary.access_token);
  } catch {
    return NextResponse.json(
      {
        error:
          "Stored token cannot be decrypted. Re-save a System User token on Connect.",
      },
      { status: 400 },
    );
  }

  const verifiedName =
    typeof body.verified_name === "string" && body.verified_name.trim()
      ? body.verified_name.trim().slice(0, 75)
      : (employee.name as string).slice(0, 75);

  if (verifiedName.length < 2) {
    return NextResponse.json(
      { error: "WhatsApp display name must be at least 2 characters" },
      { status: 400 },
    );
  }

  // Common mistake: +94… is Sri Lanka; Indian mobiles are +91 + 10 digits.
  if (parts.cc === "91" && parts.nationalNumber.length !== 10) {
    return NextResponse.json(
      {
        error: `Indian numbers need +91 and exactly 10 digits after it (got ${parts.nationalNumber.length}).`,
      },
      { status: 400 },
    );
  }
  if (parts.cc === "94" && !/^7\d{8}$/.test(parts.nationalNumber)) {
    return NextResponse.json(
      {
        error:
          "This looks like +94 (Sri Lanka). Sri Lankan mobiles are usually +94 7XXXXXXXX. If this is an Indian number, use +91 and 10 digits (e.g. +919790985447).",
      },
      { status: 400 },
    );
  }

  const { data: existingForEmployee } = await admin
    .from("whatsapp_config")
    .select("id, phone_number_id, status")
    .eq("account_id", ctx.accountId)
    .eq("employee_id", employeeId)
    .maybeSingle();

  let phoneNumberId = existingForEmployee?.phone_number_id as
    | string
    | undefined;

  try {
    if (!phoneNumberId) {
      const listed = await listWabaPhoneNumbers({
        wabaId: primary.waba_id,
        accessToken,
      });
      const match = listed.find((n) => {
        const digits = (n.display_phone_number ?? "").replace(/\D/g, "");
        return (
          digits === parts.e164Digits ||
          digits.endsWith(parts.nationalNumber) ||
          parts.e164Digits.endsWith(digits)
        );
      });

      if (match?.id) {
        phoneNumberId = match.id;
      } else {
        const created = await createWabaPhoneNumber({
          wabaId: primary.waba_id,
          accessToken,
          cc: parts.cc,
          phoneNumber: parts.nationalNumber,
          e164Digits: parts.e164Digits,
          verifiedName,
        });
        phoneNumberId = created.id;
      }
    }

    const { data: claimed } = await admin
      .from("whatsapp_config")
      .select("id, account_id, employee_id")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();

    if (claimed && claimed.account_id !== ctx.accountId) {
      return NextResponse.json(
        { error: "This phone number is linked to another workspace" },
        { status: 409 },
      );
    }
    if (
      claimed?.employee_id &&
      claimed.employee_id !== employeeId
    ) {
      return NextResponse.json(
        { error: "This Meta number is already linked to another employee" },
        { status: 409 },
      );
    }

    // Only request a new OTP on first start. Re-clicks must use Resend.
    // Repeated /request_code triggers Meta (#136024) rate limits.
    const alreadyPending =
      existingForEmployee?.status === "pending_verification" &&
      Boolean(existingForEmployee.phone_number_id);
    const forceNewCode = body.force_new_code === true;

    let codeRequested = false;
    let codeSkippedReason: string | null = null;

    if (alreadyPending && !forceNewCode) {
      codeSkippedReason =
        "A verification was already started. Enter the SMS you already received, or wait before using Resend SMS.";
    } else {
      try {
        await requestPhoneVerificationCode({
          phoneNumberId,
          accessToken,
          codeMethod: "SMS",
        });
        codeRequested = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const lower = message.toLowerCase();
        const rateLimited =
          lower.includes("136024") ||
          lower.includes("too many times") ||
          (lower.includes("verification code") && lower.includes("later"));
        // Keep pending row so user can enter a code that already arrived.
        if (!rateLimited) throw err;
        codeSkippedReason = humanizeMetaError(message);
      }
    }

    const row = {
      account_id: ctx.accountId,
      user_id: ctx.userId,
      phone_number_id: phoneNumberId,
      waba_id: primary.waba_id,
      access_token: primary.access_token,
      verify_token: primary.verify_token,
      status: "pending_verification" as const,
      is_primary: false,
      label: verifiedName,
      employee_id: employeeId,
      last_registration_error:
        codeRequested || alreadyPending ? null : codeSkippedReason,
      updated_at: new Date().toISOString(),
    };

    const targetId = existingForEmployee?.id ?? claimed?.id;
    if (targetId) {
      const { error } = await admin
        .from("whatsapp_config")
        .update(row)
        .eq("id", targetId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await admin.from("whatsapp_config").insert(row);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (!codeRequested && codeSkippedReason && !alreadyPending) {
      // First attempt rate-limited — still advance to OTP entry.
      return NextResponse.json({
        ok: true,
        phone_number_id: phoneNumberId,
        employee_id: employeeId,
        display_hint: `+${parts.e164Digits}`,
        rate_limited: true,
        message: codeSkippedReason,
      });
    }

    return NextResponse.json({
      ok: true,
      phone_number_id: phoneNumberId,
      employee_id: employeeId,
      display_hint: `+${parts.e164Digits}`,
      code_requested: codeRequested,
      message: codeRequested
        ? `SMS code sent to ${employee.phone}. Enter it below with a 6-digit PIN.`
        : codeSkippedReason ||
          `Continue: enter the SMS code sent to ${employee.phone}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: humanizeMetaError(message),
        detail: message,
        tip: "The number must receive SMS and usually cannot already be on personal WhatsApp.",
      },
      { status: 400 },
    );
  }
}
