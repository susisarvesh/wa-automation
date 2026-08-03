import { requireApiKey } from "@/lib/auth/api-keys";
import { v1Error, v1FromError, v1Ok } from "@/lib/api/v1";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/**
 * GET /api/v1/contacts?phone=+91... | ?q=name
 */
export async function GET(request: Request) {
  try {
    let ctx;
    try {
      ctx = await requireApiKey(request, "contacts:read");
    } catch {
      ctx = await requireApiKey(request, "account:read");
    }
    const limit = checkRateLimit(
      `publicApi:${ctx.keyId}`,
      RATE_LIMITS.publicApi,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const url = new URL(request.url);
    const phone = url.searchParams.get("phone")?.trim();
    const q = url.searchParams.get("q")?.trim();
    const admin = supabaseAdmin();

    let query = admin
      .from("contacts")
      .select(
        "id, name, phone, email, company, whatsapp_opt_out, marketing_opt_out, created_at, updated_at",
      )
      .eq("account_id", ctx.accountId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (phone) {
      const digits = phone.replace(/\D/g, "");
      query = query.eq("phone_normalized", digits);
    } else if (q) {
      query = query.or(
        `name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`,
      );
    }

    const { data, error } = await query;
    if (error) return v1Error("server_error", error.message, 500);
    return v1Ok({ contacts: data ?? [] });
  } catch (err) {
    return v1FromError(err);
  }
}

export async function POST(request: Request) {
  try {
    let ctx;
    try {
      ctx = await requireApiKey(request, "contacts:write");
    } catch {
      ctx = await requireApiKey(request, "messages:send");
    }
    const limit = checkRateLimit(
      `publicApi:${ctx.keyId}`,
      RATE_LIMITS.publicApi,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return v1Error("bad_request", "Invalid JSON body", 400);
    }
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!phone) return v1Error("bad_request", "phone is required", 400);

    const admin = supabaseAdmin();
    const { getAccountOwnerUserId } = await import(
      "@/lib/whatsapp/ensure-conversation"
    );
    const ownerUserId = await getAccountOwnerUserId(admin, ctx.accountId);
    const { ensureContactAndConversation } = await import(
      "@/lib/whatsapp/ensure-conversation"
    );
    const name =
      typeof body.name === "string" ? body.name : null;
    const ensured = await ensureContactAndConversation(
      admin,
      ctx.accountId,
      ownerUserId,
      phone,
      name,
    );

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.email === "string") patch.email = body.email;
    if (typeof body.company === "string") patch.company = body.company;
    if (typeof body.name === "string") patch.name = body.name;
    if (Object.keys(patch).length > 1) {
      await admin
        .from("contacts")
        .update(patch)
        .eq("id", ensured.contactId);
    }

    const { data: contact } = await admin
      .from("contacts")
      .select(
        "id, name, phone, email, company, whatsapp_opt_out, marketing_opt_out",
      )
      .eq("id", ensured.contactId)
      .maybeSingle();

    return v1Ok(
      { contact, conversation_id: ensured.conversationId },
      201,
    );
  } catch (err) {
    return v1FromError(err);
  }
}
