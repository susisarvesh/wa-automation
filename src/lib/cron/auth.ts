import { timingSafeEqual } from "node:crypto";

/**
 * Authorize Vercel Cron / GitHub keep-warm pingers.
 * Accepts either:
 *   - Authorization: Bearer <AUTOMATION_CRON_SECRET|CRON_SECRET>
 *   - x-cron-secret: <same>
 */
export function authorizeCron(request: Request): boolean {
  const expected =
    process.env.AUTOMATION_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const custom = request.headers.get("x-cron-secret") ?? "";
  const supplied = bearer || custom;
  if (!supplied) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
