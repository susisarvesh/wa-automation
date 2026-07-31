/**
 * Structured logger — JSON lines in production, readable in dev.
 * Scrubs known secret keys from meta objects.
 */

const SECRET_KEYS = new Set([
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "authorization",
  "password",
  "verify_token",
  "verifyToken",
  "connectionCode",
  "ENCRYPTION_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "AUTOMATION_CRON_SECRET",
]);

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 80 && /^[A-Za-z0-9_\-\.]{40,}$/.test(value)) {
      return `[redacted:${value.length}]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.has(k) ? "[redacted]" : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(
  level: Level,
  message: string,
  meta?: Record<string, unknown>,
) {
  const entry = {
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...(meta ? { meta: scrub(meta) as Record<string, unknown> } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) =>
    emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    emit("error", msg, meta),
};
