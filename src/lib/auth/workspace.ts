import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ForbiddenError } from "./errors";
import {
  getSingleTenantAccountId,
  isEmailAllowed,
} from "./single-tenant";
import type { AccountRole } from "./roles";

/**
 * Ensure the fixed workspace exists and attach this Google user to it.
 * First member becomes owner; later members become agents.
 */
export async function attachUserToWorkspace(
  admin: SupabaseClient,
  user: User,
): Promise<{ accountId: string; role: AccountRole; accountName: string }> {
  const email = user.email;
  if (!isEmailAllowed(email)) {
    throw new ForbiddenError(
      "This Google account is not allowed on this workspace. Ask the owner to add your email to AUTH_ALLOWED_EMAILS.",
    );
  }

  const accountId = getSingleTenantAccountId();
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    email?.split("@")[0] ||
    "Owner";

  // Ensure workspace row
  const { data: existingAccount } = await admin
    .from("accounts")
    .select("id, name, owner_user_id")
    .eq("id", accountId)
    .maybeSingle();

  if (!existingAccount) {
    const { error } = await admin.from("accounts").insert({
      id: accountId,
      name: "My Business",
      owner_user_id: user.id,
    });
    if (error) {
      console.error("[workspace] account insert failed:", error);
      throw new ForbiddenError("Could not create workspace");
    }
  } else if (!existingAccount.owner_user_id) {
    await admin
      .from("accounts")
      .update({ owner_user_id: user.id })
      .eq("id", accountId);
  }

  const { data: account } = await admin
    .from("accounts")
    .select("id, name, owner_user_id")
    .eq("id", accountId)
    .single();

  // Who is already on this workspace?
  const { data: members } = await admin
    .from("profiles")
    .select("user_id, account_role")
    .eq("account_id", accountId);

  const already = (members ?? []).find((m) => m.user_id === user.id);
  const hasOwner = (members ?? []).some((m) => m.account_role === "owner");
  const role: AccountRole =
    (already?.account_role as AccountRole | undefined) ||
    (!hasOwner || account?.owner_user_id === user.id ? "owner" : "agent");

  const { data: profile } = await admin
    .from("profiles")
    .select("id, account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    await admin.from("profiles").upsert(
      {
        user_id: user.id,
        email: email ?? "",
        full_name: fullName,
        avatar_url: (user.user_metadata?.avatar_url as string) || null,
        account_id: accountId,
        account_role: role,
      },
      { onConflict: "user_id" },
    );
  } else if (profile.account_id !== accountId) {
    // Trigger may have created a personal account — re-home to workspace.
    await admin
      .from("profiles")
      .update({
        account_id: accountId,
        account_role: role,
        full_name: fullName,
        avatar_url: (user.user_metadata?.avatar_url as string) || null,
      })
      .eq("user_id", user.id);

    // Best-effort: drop empty personal account created by handle_new_user
    if (profile.account_id) {
      await admin
        .from("accounts")
        .delete()
        .eq("id", profile.account_id)
        .eq("owner_user_id", user.id);
    }
  } else {
    await admin
      .from("profiles")
      .update({
        full_name: fullName,
        avatar_url: (user.user_metadata?.avatar_url as string) || null,
      })
      .eq("user_id", user.id);
  }

  if (role === "owner" && account?.owner_user_id !== user.id) {
    await admin
      .from("accounts")
      .update({ owner_user_id: user.id })
      .eq("id", accountId);
  }

  return {
    accountId,
    role,
    accountName: (account?.name as string) || "My Business",
  };
}
