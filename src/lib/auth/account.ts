// ============================================================
// Server-side account context — for API routes and server
// components.
//
//   AUTH_PROVIDER=google: personal workspace + access_grants
//   AUTH_PROVIDER=none: open demo with synthetic MVP session
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { hasMinRole, type AccountRole } from "./roles";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { ensureUserWorkspace } from "./workspace";
import {
  isAccessApproved,
  type AccessGrantRow,
} from "./access-grants";
import {
  DEFAULT_SINGLE_TENANT_USER_ID,
  getSingleTenantAccountId,
  isOpenDemoMode,
  isPlatformAdmin,
  SINGLE_TENANT_EMAIL,
  type AccessGrantStatus,
} from "./single-tenant";

export { UnauthorizedError, ForbiddenError } from "./errors";
export type { AccessGrantStatus };

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[toErrorResponse] uncategorized error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export interface AccountContext {
  supabase: SupabaseClient;
  userId: string;
  accountId: string;
  role: AccountRole;
  account: { id: string; name: string };
  accessStatus: AccessGrantStatus;
  email: string | null;
  isPlatformAdmin: boolean;
}

type OpenDemoBootstrap = {
  userId: string;
  accountId: string;
  accountName: string;
};

let bootstrapPromise: Promise<OpenDemoBootstrap> | null = null;

async function ensureOpenDemoBootstrap(
  admin: SupabaseClient,
  preferredAccountId: string,
): Promise<OpenDemoBootstrap> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async (): Promise<OpenDemoBootstrap> => {
      const { data: listed } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      let userId =
        listed?.users?.find((u) => u.email === SINGLE_TENANT_EMAIL)?.id ?? null;

      const mvpPassword =
        process.env.SINGLE_TENANT_PASSWORD || "mvp-dev-only-change-me";

      if (!userId) {
        const { data: created, error: createErr } =
          await admin.auth.admin.createUser({
            id: DEFAULT_SINGLE_TENANT_USER_ID,
            email: SINGLE_TENANT_EMAIL,
            password: mvpPassword,
            email_confirm: true,
            user_metadata: { full_name: "Business Owner" },
          });
        if (createErr || !created.user) {
          const retry = await admin.auth.admin.createUser({
            email: SINGLE_TENANT_EMAIL,
            password: mvpPassword,
            email_confirm: true,
            user_metadata: { full_name: "Business Owner" },
          });
          if (retry.error || !retry.data.user) {
            console.error(
              "[open-demo] createUser failed:",
              createErr ?? retry.error,
            );
            throw new ForbiddenError("Could not bootstrap workspace");
          }
          userId = retry.data.user.id;
        } else {
          userId = created.user.id;
        }
      } else {
        await admin.auth.admin.updateUserById(userId, {
          password: mvpPassword,
        });
      }

      let workspaceId = preferredAccountId;
      let accountName = "My Business";

      const { data: existingAccount } = await admin
        .from("accounts")
        .select("id, name")
        .eq("id", preferredAccountId)
        .maybeSingle();

      if (existingAccount) {
        accountName = (existingAccount.name as string) || accountName;
      } else {
        const { data: ownedByUser } = await admin
          .from("accounts")
          .select("id, name")
          .eq("owner_user_id", userId)
          .maybeSingle();

        if (ownedByUser) {
          workspaceId = ownedByUser.id as string;
          accountName = (ownedByUser.name as string) || accountName;
        } else {
          const { error: acctErr } = await admin.from("accounts").insert({
            id: preferredAccountId,
            name: accountName,
            owner_user_id: userId,
          });
          if (acctErr) {
            console.error("[open-demo] account insert failed:", acctErr);
            throw new ForbiddenError("Could not bootstrap workspace");
          }
        }
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profile) {
        await admin.from("profiles").upsert(
          {
            user_id: userId,
            email: SINGLE_TENANT_EMAIL,
            full_name: "Business Owner",
            account_id: workspaceId,
            account_role: "owner",
          },
          { onConflict: "user_id" },
        );
      } else {
        await admin
          .from("profiles")
          .update({ account_id: workspaceId, account_role: "owner" })
          .eq("user_id", userId);
      }

      const { data: tag } = await admin
        .from("tags")
        .select("id")
        .eq("account_id", workspaceId)
        .eq("name", "Customer")
        .maybeSingle();
      if (!tag) {
        await admin.from("tags").insert({
          account_id: workspaceId,
          user_id: userId,
          name: "Customer",
          color: "#10b981",
        });
      }

      return { userId, accountId: workspaceId, accountName };
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }

  return bootstrapPromise;
}

export async function getCurrentAccount(): Promise<AccountContext> {
  if (isOpenDemoMode()) {
    const admin = supabaseAdmin();
    const { userId, accountId, accountName } = await ensureOpenDemoBootstrap(
      admin,
      getSingleTenantAccountId(),
    );
    return {
      supabase: admin,
      userId,
      accountId,
      role: "owner",
      account: { id: accountId, name: accountName },
      accessStatus: "approved",
      email: SINGLE_TENANT_EMAIL,
      isPlatformAdmin: false,
    };
  }

  // Google (and any non-demo) path: personal workspace + grants
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  const admin = supabaseAdmin();
  const { accountId, role, accountName, accessStatus } =
    await ensureUserWorkspace(admin, user);

  return {
    supabase,
    userId: user.id,
    accountId,
    role,
    account: { id: accountId, name: accountName },
    accessStatus,
    email: user.email ?? null,
    isPlatformAdmin: isPlatformAdmin(user.email),
  };
}

export async function requireRole(min: AccountRole): Promise<AccountContext> {
  const ctx = await getCurrentAccount();
  if (isOpenDemoMode()) return ctx;
  if (!hasMinRole(ctx.role, min)) {
    throw new ForbiddenError(
      `This action requires the '${min}' role or higher`,
    );
  }
  return ctx;
}

/**
 * Require platform access grant (approved). Use for Connect / create
 * automations / send / write APIs.
 */
export async function requireGranted(
  min: AccountRole = "agent",
): Promise<AccountContext> {
  const ctx = await requireRole(min);
  if (isOpenDemoMode()) return ctx;
  if (!isAccessApproved(ctx.accessStatus)) {
    throw new ForbiddenError(
      "Your account is waiting for admin approval. You can browse what's available, but can't connect WhatsApp or create automations yet.",
    );
  }
  return ctx;
}

export async function requirePlatformAdmin(): Promise<AccountContext> {
  const ctx = await getCurrentAccount();
  if (!ctx.isPlatformAdmin) {
    throw new ForbiddenError("Platform admin only");
  }
  return ctx;
}

export type { AccessGrantRow };
