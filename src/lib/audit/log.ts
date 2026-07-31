import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/observability/logger";

export type AuditAction =
  | "access.approve"
  | "access.revoke"
  | "access.pending"
  | "whatsapp.connect"
  | "whatsapp.disconnect"
  | "whatsapp.token_rotate"
  | "auth.login"
  | "admin.break_glass";

/**
 * Append-only audit event (service role). Never throws to callers.
 */
export async function writeAuditLog(
  admin: SupabaseClient,
  input: {
    action: AuditAction | string;
    actorUserId?: string | null;
    accountId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    meta?: Record<string, unknown>;
    ip?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("audit_logs").insert({
      action: input.action,
      actor_user_id: input.actorUserId ?? null,
      account_id: input.accountId ?? null,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      meta: input.meta ?? {},
      ip: input.ip ?? null,
    });
    if (error) {
      log.warn("audit_logs insert failed", { message: error.message });
    }
  } catch (err) {
    log.warn("audit_logs insert threw", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
