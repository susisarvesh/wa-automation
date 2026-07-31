/**
 * Optional Google email domain allowlist.
 * AUTH_ALLOWED_DOMAINS=vsmarttec.com,partner.com
 * Empty = any domain (subject to access_grants).
 */

export function getAllowedDomains(): string[] {
  const raw = process.env.AUTH_ALLOWED_DOMAINS || "";
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isEmailDomainAllowed(
  email: string | undefined | null,
): boolean {
  if (!email || !email.includes("@")) return false;
  const domains = getAllowedDomains();
  if (domains.length === 0) return true;
  const domain = email.split("@").pop()?.toLowerCase() ?? "";
  return domains.includes(domain);
}

/** Session max age in hours (middleware). 0 / unset = no extra check. */
export function getSessionMaxAgeHours(): number {
  const raw = process.env.AUTH_SESSION_MAX_AGE_HOURS;
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
