import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/automations/admin-client";

export const API_KEY_SCOPES = [
  "messages:send",
  "account:read",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export type ApiKeyContext = {
  accountId: string;
  keyId: string;
  scopes: string[];
  name: string;
};

export class ApiKeyError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiKeyError";
    this.code = code;
    this.status = status;
  }
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Generate `wak_<8hex>_<32hex>` and its hash / prefix. */
export function generateApiKey(): {
  plaintext: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(16).toString("hex");
  const plaintext = `wak_${prefix}_${secret}`;
  return {
    plaintext,
    tokenHash: hashApiKey(plaintext),
    tokenPrefix: `wak_${prefix}`,
  };
}

export function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

/**
 * Authenticate a public `/api/v1` request via Bearer API key.
 * Uses service role for hash lookup (bypasses RLS).
 */
export async function requireApiKey(
  request: Request,
  requiredScope?: ApiKeyScope | string,
): Promise<ApiKeyContext> {
  const token = parseBearerToken(request);
  if (!token || !token.startsWith("wak_")) {
    throw new ApiKeyError(
      "unauthorized",
      "Missing or invalid Authorization Bearer token",
      401,
    );
  }

  const tokenHash = hashApiKey(token);
  const admin = supabaseAdmin();

  // Live DB uses key_hash / key_prefix (legacy CHANGELOG schema).
  const { data: row, error } = await admin
    .from("api_keys")
    .select("id, account_id, name, scopes, revoked_at, expires_at, key_hash")
    .eq("key_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new ApiKeyError("server_error", error.message, 500);
  }
  if (!row || row.revoked_at) {
    throw new ApiKeyError("unauthorized", "Invalid or revoked API key", 401);
  }
  if (
    row.expires_at &&
    new Date(String(row.expires_at)).getTime() <= Date.now()
  ) {
    throw new ApiKeyError("unauthorized", "API key has expired", 401);
  }

  // Defense in depth if DB collation ever surprises us
  const stored = Buffer.from(String(row.key_hash));
  const incoming = Buffer.from(tokenHash);
  if (
    stored.length !== incoming.length ||
    !timingSafeEqual(stored, incoming)
  ) {
    throw new ApiKeyError("unauthorized", "Invalid or revoked API key", 401);
  }

  const scopes = Array.isArray(row.scopes)
    ? (row.scopes as string[]).map(String)
    : [];

  if (requiredScope && !hasScope(scopes, requiredScope)) {
    throw new ApiKeyError(
      "forbidden",
      `API key missing required scope: ${requiredScope}`,
      403,
    );
  }

  // Fire-and-forget last_used_at
  void admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    accountId: row.account_id as string,
    keyId: row.id as string,
    scopes,
    name: (row.name as string) || "API key",
  };
}
