import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { writeAuditLog } from "@/lib/audit/log";
import { supabaseAdmin } from "@/lib/automations/admin-client";

type Params = { params: Promise<{ id: string }> };

/** DELETE — revoke (soft) an API key. */
export async function DELETE(_request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("api_keys")
    .select("id, revoked_at")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.revoked_at) {
    return NextResponse.json({ ok: true, already_revoked: true });
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("id", id)
    .eq("account_id", ctx.accountId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(admin, {
    action: "api_key.revoke",
    actorUserId: ctx.userId,
    accountId: ctx.accountId,
    resourceType: "api_key",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
