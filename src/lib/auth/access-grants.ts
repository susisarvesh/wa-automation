import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AccessGrantStatus } from "./single-tenant";
import { isPlatformAdmin } from "./single-tenant";

export type AccessGrantRow = {
  user_id: string;
  email: string;
  status: AccessGrantStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isAccessApproved(status: AccessGrantStatus | null | undefined): boolean {
  return status === "approved";
}

/**
 * Ensure a grant row exists. Platform admins are auto-approved.
 * Existing approved/revoked rows are left alone (idempotent for pending).
 */
export async function ensureAccessGrant(
  admin: SupabaseClient,
  user: User,
): Promise<AccessGrantStatus> {
  const email = (user.email ?? "").toLowerCase();
  const adminUser = isPlatformAdmin(email);

  const { data: existing } = await admin
    .from("access_grants")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.status) {
    // Promote admin to approved if somehow pending/revoked
    if (adminUser && existing.status !== "approved") {
      await admin
        .from("access_grants")
        .update({
          status: "approved",
          email,
          decided_by: user.id,
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      return "approved";
    }
    return existing.status as AccessGrantStatus;
  }

  // Invite-by-email: pending platform_invites auto-approve on first login
  let invited = false;
  if (!adminUser && email) {
    const { data: invite } = await admin
      .from("platform_invites")
      .select("id, invited_by")
      .eq("status", "pending")
      .ilike("email", email)
      .maybeSingle();
    if (invite) {
      invited = true;
      await admin
        .from("platform_invites")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invite.id);
    }
  }

  const status: AccessGrantStatus =
    adminUser || invited ? "approved" : "pending";
  const now = new Date().toISOString();
  const { error } = await admin.from("access_grants").insert({
    user_id: user.id,
    email,
    status,
    decided_by: adminUser ? user.id : null,
    decided_at: adminUser || invited ? now : null,
    created_at: now,
    updated_at: now,
  });

  if (error) {
    // Race: another request inserted first
    const { data: again } = await admin
      .from("access_grants")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (again?.status) return again.status as AccessGrantStatus;
    console.error("[access_grants] insert failed:", error);
    return status;
  }

  return status;
}

export async function getAccessGrantStatus(
  admin: SupabaseClient,
  userId: string,
): Promise<AccessGrantStatus | null> {
  const { data } = await admin
    .from("access_grants")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.status as AccessGrantStatus | undefined) ?? null;
}

export async function setAccessGrantStatus(
  admin: SupabaseClient,
  params: {
    userId: string;
    status: "approved" | "revoked";
    decidedBy: string;
    email?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.status,
    decided_by: params.decidedBy,
    decided_at: now,
    updated_at: now,
  };
  if (params.email) patch.email = params.email.toLowerCase();

  const { data: existing } = await admin
    .from("access_grants")
    .select("user_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("access_grants")
      .update(patch)
      .eq("user_id", params.userId);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("access_grants").insert({
    user_id: params.userId,
    email: (params.email ?? "").toLowerCase(),
    ...patch,
    created_at: now,
  });
  if (error) throw error;
}
