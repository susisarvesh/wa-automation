import { log } from "./logger";

/**
 * Report an error to Sentry (if SENTRY_DSN is set) via the envelope API,
 * without requiring @sentry/nextjs. Always logs locally with scrubbing.
 */
export async function reportError(
  err: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log.error(message, { ...context, stack });

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    const url = new URL(dsn);
    // DSN: https://<key>@<host>/<projectId>
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    const ingest = `${url.protocol}//${url.host}/api/${projectId}/store/`;
    const payload = {
      message,
      level: "error",
      platform: "node",
      timestamp: Date.now() / 1000,
      tags: { app: "wa-automation" },
      extra: context ?? {},
      exception: stack
        ? {
            values: [
              {
                type: err instanceof Error ? err.name : "Error",
                value: message,
                stacktrace: { frames: [{ filename: "app", function: stack }] },
              },
            ],
          }
        : undefined,
    };
    await fetch(ingest, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=wa-automation/1.0`,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // never throw from reporter
  }
}
