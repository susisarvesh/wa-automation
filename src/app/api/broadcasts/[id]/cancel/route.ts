import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { writeAuditLog } from "@/lib/audit/log";

type Params = { params: Promise<{ id: string }> };

/** Cancel a scheduled campaign → draft, or stop an in-flight send. */
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

  if (broadcast.status === "scheduled") {
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
      meta: { from: "scheduled" },
    });

    return NextResponse.json({ broadcast: updated });
  }

  if (broadcast.status === "sending") {
    const now = new Date().toISOString();
    await admin
      .from("broadcast_recipients")
      .update({
        status: "cancelled",
        error_message: "Cancelled by user",
      })
      .eq("broadcast_id", id)
      .eq("status", "pending");

    const { data: updated, error: updErr } = await admin
      .from("broadcasts")
      .update({
        status: "cancelled",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "sending")
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
      meta: { from: "sending" },
    });

    return NextResponse.json({ broadcast: updated });
  }

  return NextResponse.json(
    { error: "Only scheduled or sending campaigns can be cancelled" },
    { status: 400 },
  );
}
