import { requireApiKey } from "@/lib/auth/api-keys";
import { v1Error, v1FromError, v1Ok } from "@/lib/api/v1";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/**
 * GET /api/v1/conversations/:id/messages — recent history for CRM sync.
 */
export async function GET(
  request: Request,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    let ctx;
    try {
      ctx = await requireApiKey(request, "conversations:read");
    } catch {
      ctx = await requireApiKey(request, "account:read");
    }
    const limit = checkRateLimit(
      `publicApi:${ctx.keyId}`,
      RATE_LIMITS.publicApi,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await ctxParams.params;
    const admin = supabaseAdmin();

    const { data: conv, error: cErr } = await admin
      .from("conversations")
      .select("id, account_id, contact_id, status")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();
    if (cErr) return v1Error("server_error", cErr.message, 500);
    if (!conv) return v1Error("not_found", "Conversation not found", 404);

    const url = new URL(request.url);
    const limitN = Math.min(
      Number(url.searchParams.get("limit") ?? 50) || 50,
      100,
    );

    const { data: messages, error } = await admin
      .from("messages")
      .select(
        "id, message_id, sender_type, content_type, content_text, status, created_at",
      )
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(limitN);

    if (error) return v1Error("server_error", error.message, 500);
    return v1Ok({
      conversation: conv,
      messages: (messages ?? []).reverse(),
    });
  } catch (err) {
    return v1FromError(err);
  }
}
