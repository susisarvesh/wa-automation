// ============================================================
// Server-side account context — for API routes and server
// components.
//
//   AUTH_PROVIDER=google (default): real Google session, fixed workspace
//   AUTH_PROVIDER=none: open demo with synthetic MVP session
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { hasMinRole, isAccountRole, type AccountRole } from "./roles";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { attachUserToWorkspace } from "./workspace";
import {
  DEFAULT_SINGLE_TENANT_USER_ID,
  getSingleTenantAccountId,
  isGoogleAuthEnabled,
  isOpenDemoMode,
  SINGLE_TENANT_EMAIL,
} from "./single-tenant";

export { UnauthorizedError, ForbiddenError } from "./errors";

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

      // Prefer fixed SINGLE_TENANT_ACCOUNT_ID. If handle_new_user already
      // created a personal account for this user (unique owner_user_id),
      // reuse that workspace instead of failing the insert.
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
          console.warn(
            "[open-demo] fixed account missing; reusing owner account",
            workspaceId,
          );
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
  // Google Auth: real session attached to the fixed workspace
  if (isGoogleAuthEnabled()) {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      throw new UnauthorizedError();
    }

    const admin = supabaseAdmin();
    const { accountId, role, accountName } = await attachUserToWorkspace(
      admin,
      user,
    );

    return {
      supabase,
      userId: user.id,
      accountId,
      role,
      account: { id: accountId, name: accountName },
    };
  }

  // Open demo: service-role as synthetic owner
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
    };
  }

  // Fallback multi-tenant path (rare)
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("account_id, account_role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[getCurrentAccount] profile fetch error:", error);
    throw new ForbiddenError("Could not load account context");
  }
  if (!data || !data.account_id || !data.account_role) {
    throw new ForbiddenError("Profile is not linked to an account");
  }
  if (!isAccountRole(data.account_role)) {
    throw new ForbiddenError(`Unknown account role: ${data.account_role}`);
  }

  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("id", data.account_id)
    .maybeSingle();

  if (accountErr || !account) {
    throw new ForbiddenError("Could not load account context");
  }

  return {
    supabase,
    userId: user.id,
    accountId: data.account_id,
    role: data.account_role,
    account: { id: account.id, name: account.name },
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
