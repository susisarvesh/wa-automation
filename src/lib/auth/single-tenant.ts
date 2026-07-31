/**
 * Single-tenant workspace — one fixed account for the whole deploy.
 *
 * Auth modes:
 *   - Google (default): Supabase Google OAuth required; users join this account
 *   - Open demo: AUTH_PROVIDER=none — invisible MVP session (not production-safe)
 */

export const DEFAULT_SINGLE_TENANT_ACCOUNT_ID =
  "a0000000-0000-4000-8000-000000000001";

/** Synthetic auth user used only for open-demo FK stamps. */
export const DEFAULT_SINGLE_TENANT_USER_ID =
  "a0000000-0000-4000-8000-000000000002";

export const SINGLE_TENANT_EMAIL = "mvp@localhost.local";

export type AuthProvider = "google" | "none";

export function getAuthProvider(): AuthProvider {
  const raw = (process.env.AUTH_PROVIDER || "google").toLowerCase().trim();
  return raw === "none" ? "none" : "google";
}

export function isGoogleAuthEnabled(): boolean {
  // Google owner login for the fixed single-tenant workspace.
  return getAuthProvider() === "google" && isSingleTenantMode();
}

/** Open demo mode — no login UI (single-tenant only). */
export function isOpenDemoMode(): boolean {
  return getAuthProvider() === "none" && isSingleTenantMode();
}

/** @deprecated use isOpenDemoMode / isGoogleAuthEnabled */
export function isSingleTenantMode(): boolean {
  // Kept for older call sites: "single tenant workspace" is always on.
  // Open demo short-circuits auth; Google still uses the fixed account id.
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

/** Optional comma-separated allowlist for Google emails. Empty = any Google user. */
export function getAllowedEmails(): string[] {
  const raw = process.env.AUTH_ALLOWED_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  const allow = getAllowedEmails();
  if (allow.length === 0) return true;
  return allow.includes(email.toLowerCase());
}
