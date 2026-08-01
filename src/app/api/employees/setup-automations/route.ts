import { NextResponse } from "next/server";
import {
  requireGranted,
  toErrorResponse,
  type AccountContext,
} from "@/lib/auth/account";
import { ensureCompanyServicesAutomations } from "@/lib/employees/ensure-services-automations";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { verifyPhoneNumber } from "@/lib/whatsapp/meta-api";
import { resolveWhatsAppConfig } from "@/lib/whatsapp/resolve-config";

/**
 * POST /api/employees/setup-automations
 * Idempotent quick-setup: welcome (services menu) + FAQ keyword automation
 * on the company WhatsApp number for this account.
 */
export async function POST(request: Request) {
  let ctx: AccountContext;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => ({}));
  const servicesText =
    typeof body.services_message === "string" && body.services_message.trim()
      ? body.services_message.trim()
      : undefined;
  const faqText =
    typeof body.faq_message === "string" && body.faq_message.trim()
      ? body.faq_message.trim()
      : undefined;

  let created: string[] = [];
  let skipped: string[] = [];
  try {
    const result = await ensureCompanyServicesAutomations({
      accountId: ctx.accountId,
      userId: ctx.userId,
      servicesText,
      faqText,
    });
    created = result.created;
    skipped = result.skipped;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const admin = supabaseAdmin();
  const config = await resolveWhatsAppConfig(admin, ctx.accountId);
  let businessNumber: string | null = null;
  if (config) {
    try {
      const info = await verifyPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken: decrypt(config.access_token),
      });
      businessNumber = info.display_phone_number ?? null;
    } catch {
      businessNumber = null;
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    business_number: businessNumber,
    message:
      created.length > 0
        ? `Activated: ${created.join(", ")}`
        : "Services automations already exist for this workspace.",
    how_to_test: businessNumber
      ? `From another phone, open WhatsApp and message ${businessNumber} with “Hi”. Do not message an employee’s personal number.`
      : "From another phone, message your connected company Meta WhatsApp number with “Hi” (Connect page). Not an employee’s personal phone.",
  });
}
