import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ForbiddenError } from "./errors";
import {
  getSingleTenantAccountId,
  isPlatformAdmin,
} from "./single-tenant";
import type { AccountRole } from "./roles";
import type { AccessGrantStatus } from "./single-tenant";
import { ensureAccessGrant } from "./access-grants";
import { isEmailDomainAllowed } from "./domain-allowlist";
import { writeAuditLog } from "@/lib/audit/log";

export type WorkspaceAttachResult = {
  accountId: string;
  role: AccountRole;
  accountName: string;
  accessStatus: AccessGrantStatus;
};

function displayName(user: User): string {
  return (
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Owner"
  );
}

/**
 * Ensure the Google user has a personal workspace + access_grants row.
 *
 * Platform admin (vsmarttechindia@…) keeps/links the existing production
 * workspace (SINGLE_TENANT_ACCOUNT_ID). Everyone else keeps the personal
 * account created by handle_new_user (or we create one).
 */
export async function ensureUserWorkspace(
  admin: SupabaseClient,
  user: User,
): Promise<WorkspaceAttachResult> {
  const email = user.email ?? "";
  const fullName = displayName(user);
  if (!isEmailDomainAllowed(email)) {
    throw new ForbiddenError(
      "This email domain is not allowed. Ask the admin to add your domain to AUTH_ALLOWED_DOMAINS or invite your address.",
    );
  }
  const adminEmail = isPlatformAdmin(email);
  const legacyAccountId = getSingleTenantAccountId();

  let { data: profile } = await admin
    .from("profiles")
    .select("id, account_id, account_role")
    .eq("user_id", user.id)
    .maybeSingle();

  // Admin: prefer existing production workspace for data continuity
  if (adminEmail) {
    const { data: legacy } = await admin
      .from("accounts")
      .select("id, name, owner_user_id")
      .eq("id", legacyAccountId)
      .maybeSingle();

    if (legacy) {
      if (!profile) {
        await admin.from("profiles").upsert(
          {
            user_id: user.id,
            email,
            full_name: fullName,
            avatar_url: (user.user_metadata?.avatar_url as string) || null,
            account_id: legacy.id,
            account_role: "owner",
          },
          { onConflict: "user_id" },
        );
      } else if (profile.account_id !== legacy.id) {
        const oldId = profile.account_id as string | null;
        await admin
          .from("profiles")
          .update({
            account_id: legacy.id,
            account_role: "owner",
            full_name: fullName,
            avatar_url: (user.user_metadata?.avatar_url as string) || null,
            email,
          })
          .eq("user_id", user.id);

        // Drop empty personal account if handle_new_user created one
        if (oldId && oldId !== legacy.id) {
          await admin
            .from("accounts")
            .delete()
            .eq("id", oldId)
            .eq("owner_user_id", user.id);
        }
      } else {
        await admin
          .from("profiles")
          .update({
            full_name: fullName,
            avatar_url: (user.user_metadata?.avatar_url as string) || null,
            email,
          })
          .eq("user_id", user.id);
      }

      if (legacy.owner_user_id !== user.id) {
        await admin
          .from("accounts")
          .update({ owner_user_id: user.id })
          .eq("id", legacy.id);
      }

      const accessStatus = await ensureAccessGrant(admin, user);
      void writeAuditLog(admin, {
        action: "auth.login",
        actorUserId: user.id,
        accountId: legacy.id as string,
        resourceType: "access_grants",
        resourceId: user.id,
        meta: { accessStatus, email, adminWorkspace: true },
      });
      return {
        accountId: legacy.id as string,
        role: "owner",
        accountName: (legacy.name as string) || "My Business",
        accessStatus,
      };
    }
  }

  // Normal user (or admin without legacy row): personal account
  if (!profile?.account_id) {
    // handle_new_user usually creates account+profile; fill gaps
    let accountId: string | null = null;

    const { data: owned } = await admin
      .from("accounts")
      .select("id, name")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (owned) {
      accountId = owned.id as string;
    } else {
      const { data: created, error } = await admin
        .from("accounts")
        .insert({
          name: fullName || "My Business",
          owner_user_id: user.id,
        })
        .select("id, name")
        .single();
      if (error || !created) {
        console.error("[workspace] account insert failed:", error);
        throw new ForbiddenError("Could not create workspace");
      }
      accountId = created.id as string;
    }

    if (!profile) {
      await admin.from("profiles").upsert(
        {
          user_id: user.id,
          email,
          full_name: fullName,
          avatar_url: (user.user_metadata?.avatar_url as string) || null,
          account_id: accountId,
          account_role: "owner",
        },
        { onConflict: "user_id" },
      );
    } else {
      await admin
        .from("profiles")
        .update({
          account_id: accountId,
          account_role: "owner",
          full_name: fullName,
          avatar_url: (user.user_metadata?.avatar_url as string) || null,
          email,
        })
        .eq("user_id", user.id);
    }

    profile = {
      id: profile?.id,
      account_id: accountId,
      account_role: "owner",
    };
  } else {
    await admin
      .from("profiles")
      .update({
        full_name: fullName,
        avatar_url: (user.user_metadata?.avatar_url as string) || null,
        email,
      })
      .eq("user_id", user.id);
  }

  const accountId = profile.account_id as string;
  const { data: account } = await admin
    .from("accounts")
    .select("id, name")
    .eq("id", accountId)
    .maybeSingle();

  if (!account) {
    throw new ForbiddenError("Could not load workspace");
  }

  const accessStatus = await ensureAccessGrant(admin, user);
  const role = (profile.account_role as AccountRole) || "owner";

  void writeAuditLog(admin, {
    action: "auth.login",
    actorUserId: user.id,
    accountId,
    resourceType: "access_grants",
    resourceId: user.id,
    meta: { accessStatus, email },
  });

  return {
    accountId,
    role: isAccountRoleSafe(role) ? role : "owner",
    accountName: (account.name as string) || "My Business",
    accessStatus,
  };
}

function isAccountRoleSafe(role: string): role is AccountRole {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "agent" ||
    role === "viewer"
  );
}

/** @deprecated use ensureUserWorkspace */
export async function attachUserToWorkspace(
  admin: SupabaseClient,
  user: User,
): Promise<{ accountId: string; role: AccountRole; accountName: string }> {
  const r = await ensureUserWorkspace(admin, user);
  return {
    accountId: r.accountId,
    role: r.role,
    accountName: r.accountName,
  };
}
