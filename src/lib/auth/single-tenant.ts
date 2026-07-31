/**
 * Single-tenant MVP mode — no login UI, one fixed workspace.
 * Not production-safe. Server scopes all writes to this account.
 */

export const DEFAULT_SINGLE_TENANT_ACCOUNT_ID =
  "a0000000-0000-4000-8000-000000000001";

/** Synthetic auth user used only for NOT NULL user_id FKs. */
export const DEFAULT_SINGLE_TENANT_USER_ID =
  "a0000000-0000-4000-8000-000000000002";

export const SINGLE_TENANT_EMAIL = "mvp@localhost.local";

export function isSingleTenantMode(): boolean {
  // Always on for this fork unless explicitly disabled.
  return process.env.SINGLE_TENANT_MODE !== "false";
}

export function getSingleTenantAccountId(): string {
  return (
    process.env.SINGLE_TENANT_ACCOUNT_ID ||
    process.env.NEXT_PUBLIC_SINGLE_TENANT_ACCOUNT_ID ||
    DEFAULT_SINGLE_TENANT_ACCOUNT_ID
  );
}

export function getPublicSingleTenantAccountId(): string {
  return (
    process.env.NEXT_PUBLIC_SINGLE_TENANT_ACCOUNT_ID ||
    DEFAULT_SINGLE_TENANT_ACCOUNT_ID
  );
}
