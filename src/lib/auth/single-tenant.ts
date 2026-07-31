/**
 * Auth modes + platform admin helpers.
 *
 *   AUTH_PROVIDER=google (default): Google OAuth, personal workspaces,
 *     gated by access_grants (platform admin Approves / Revokes).
 *   AUTH_PROVIDER=none: open demo with synthetic MVP session (local only).
 */

export const DEFAULT_SINGLE_TENANT_ACCOUNT_ID =
  "a0000000-0000-4000-8000-000000000001";

/** Synthetic auth user used only for open-demo FK stamps. */
export const DEFAULT_SINGLE_TENANT_USER_ID =
  "a0000000-0000-4000-8000-000000000002";

export const SINGLE_TENANT_EMAIL = "mvp@localhost.local";

export const DEFAULT_PLATFORM_ADMIN_EMAIL = "vsmarttechindia@gmail.com";

export type AuthProvider = "google" | "none";

export type AccessGrantStatus = "pending" | "approved" | "revoked";

export function getAuthProvider(): AuthProvider {
  const raw = (process.env.AUTH_PROVIDER || "google").toLowerCase().trim();
  return raw === "none" ? "none" : "google";
}

/** Google OAuth path (personal workspaces + access grants). */
export function isGoogleAuthEnabled(): boolean {
  return getAuthProvider() === "google";
}

/** Open demo mode — no login UI. */
export function isOpenDemoMode(): boolean {
  return getAuthProvider() === "none";
}

/**
 * Legacy flag: when true, open-demo prefers a fixed account UUID.
 * Production multi-tenant sets SINGLE_TENANT_MODE=false.
 */
export function isSingleTenantMode(): boolean {
  return process.env.SINGLE_TENANT_MODE !== "false";
}

/** Existing admin workspace UUID (kept for data continuity). */
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

/** Platform admins who can Approve / Revoke access. */
export function getPlatformAdminEmails(): string[] {
  const raw =
    process.env.PLATFORM_ADMIN_EMAILS || DEFAULT_PLATFORM_ADMIN_EMAIL;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  return getPlatformAdminEmails().includes(email.toLowerCase());
}

/** @deprecated Login is open; use access_grants instead. */
export function getAllowedEmails(): string[] {
  const raw = process.env.AUTH_ALLOWED_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** @deprecated */
export function isEmailAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  const allow = getAllowedEmails();
  if (allow.length === 0) return true;
  return allow.includes(email.toLowerCase());
}
