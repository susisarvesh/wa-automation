import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { writeAuditLog } from "@/lib/audit/log";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  API_KEY_SCOPES,
  generateApiKey,
  type ApiKeyScope,
} from "@/lib/auth/api-keys";

/** GET — list API keys for this account (no secrets). */
export async function GET() {
  try {
    const ctx = await requireGranted("admin");
    const { data, error } = await ctx.supabase
      .from("api_keys")
      .select(
        "id, name, token_prefix, scopes, last_used_at, revoked_at, created_at",
      )
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      keys: data ?? [],
      available_scopes: API_KEY_SCOPES,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** POST — create a key; returns plaintext token once. */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : "API key";

  let scopes: ApiKeyScope[] = ["messages:send", "account:read"];
  if (Array.isArray(body.scopes) && body.scopes.length > 0) {
    const allowed = new Set<string>(API_KEY_SCOPES);
    scopes = body.scopes
      .filter((s: unknown): s is string => typeof s === "string")
      .filter((s: string) => allowed.has(s)) as ApiKeyScope[];
    if (scopes.length === 0) {
      return NextResponse.json(
        { error: "scopes must include at least one valid scope" },
        { status: 400 },
      );
    }
  }

  const { plaintext, tokenHash, tokenPrefix } = generateApiKey();
  const admin = supabaseAdmin();

  const { data: row, error } = await admin
    .from("api_keys")
    .insert({
      account_id: ctx.accountId,
      name,
      token_prefix: tokenPrefix,
      token_hash: tokenHash,
      scopes,
      created_by: ctx.userId,
    })
    .select("id, name, token_prefix, scopes, created_at")
    .single();

  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create key" },
      { status: 500 },
    );
  }

  await writeAuditLog(admin, {
    action: "api_key.create",
    actorUserId: ctx.userId,
    accountId: ctx.accountId,
    resourceType: "api_key",
    resourceId: row.id,
    meta: { name, scopes },
  });

  return NextResponse.json(
    {
      key: row,
      token: plaintext,
      warning:
        "Copy this token now. It will not be shown again.",
    },
    { status: 201 },
  );
}
