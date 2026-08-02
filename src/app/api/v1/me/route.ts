import { requireApiKey } from "@/lib/auth/api-keys";
import { v1FromError, v1Ok } from "@/lib/api/v1";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { resolveWhatsAppConfig } from "@/lib/whatsapp/resolve-config";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiKey(request, "account:read");
    const limit = checkRateLimit(
      `publicApi:${ctx.keyId}`,
      RATE_LIMITS.publicApi,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const admin = supabaseAdmin();
    const { data: account } = await admin
      .from("accounts")
      .select("id, name")
      .eq("id", ctx.accountId)
      .maybeSingle();

    const wa = await resolveWhatsAppConfig(admin, ctx.accountId);

    return v1Ok({
      account_id: ctx.accountId,
      account_name: account?.name ?? null,
      key_name: ctx.name,
      scopes: ctx.scopes,
      whatsapp_connected: Boolean(wa?.phone_number_id && wa.status === "connected"),
      whatsapp_phone_number_id: wa?.phone_number_id ?? null,
    });
  } catch (err) {
    return v1FromError(err);
  }
}
