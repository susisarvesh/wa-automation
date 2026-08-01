import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { decrypt } from "@/lib/whatsapp/encryption";
import { listWabaPhoneNumbers } from "@/lib/whatsapp/meta-api";
import { humanizeMetaError } from "@/lib/whatsapp/meta-errors";
import { resolveWhatsAppConfig } from "@/lib/whatsapp/resolve-config";

/**
 * GET — phone numbers on the connected WABA (from Meta), with which
 * ones are already linked in this workspace. Powers one-click Add.
 */
export async function GET() {
  try {
    const ctx = await requireGranted("admin");
    const admin = supabaseAdmin();
    const primary = await resolveWhatsAppConfig(admin, ctx.accountId);

    if (!primary) {
      return NextResponse.json(
        { error: "Connect a WhatsApp number first." },
        { status: 400 },
      );
    }
    if (!primary.waba_id) {
      return NextResponse.json(
        {
          error:
            "WhatsApp Business Account ID is missing. Update credentials on Connect and include the WABA ID.",
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
            "Stored token cannot be decrypted. Paste a permanent System User token on Connect.",
        },
        { status: 400 },
      );
    }

    let metaNumbers;
    try {
      metaNumbers = await listWabaPhoneNumbers({
        wabaId: primary.waba_id,
        accessToken,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: humanizeMetaError(message), detail: message },
        { status: 400 },
      );
    }

    const { data: linked } = await admin
      .from("whatsapp_config")
      .select("phone_number_id")
      .eq("account_id", ctx.accountId);

    const linkedIds = new Set(
      (linked ?? []).map((r) => r.phone_number_id as string),
    );

    const available = metaNumbers.map((n) => ({
      phone_number_id: n.id,
      display_phone_number: n.display_phone_number ?? null,
      verified_name: n.verified_name ?? null,
      quality_rating: n.quality_rating ?? null,
      already_linked: linkedIds.has(n.id),
    }));

    return NextResponse.json({
      waba_id: primary.waba_id,
      numbers: available,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
