import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { writeAuditLog } from "@/lib/audit/log";

type Params = { params: Promise<{ id: string }> };

/** Cancel a scheduled campaign → back to draft. */
export async function POST(_request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("agent");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: broadcast, error } = await admin
    .from("broadcasts")
    .select("*")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!broadcast) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (broadcast.status !== "scheduled") {
    return NextResponse.json(
      { error: "Only scheduled campaigns can be cancelled" },
      { status: 400 },
    );
  }

  const { data: updated, error: updErr } = await admin
    .from("broadcasts")
    .update({
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "scheduled")
    .select("*")
    .single();

  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "cancel failed" },
      { status: 500 },
    );
  }

  await writeAuditLog(admin, {
    action: "broadcast.cancel",
    actorUserId: ctx.userId,
    accountId: ctx.accountId,
    resourceType: "broadcast",
    resourceId: id,
  });

  return NextResponse.json({ broadcast: updated });
}
