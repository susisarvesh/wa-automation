import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { writeAuditLog } from "@/lib/audit/log";

type Params = { params: Promise<{ id: string }> };

/**
 * Cancel a scheduled campaign → draft (clears schedule + recipients),
 * or stop an in-flight sending campaign → cancelled.
 */
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

  if (broadcast.status !== "scheduled" && broadcast.status !== "sending") {
    return NextResponse.json(
      { error: "Only scheduled or sending campaigns can be cancelled" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  if (broadcast.status === "scheduled") {
    await admin
      .from("broadcast_recipients")
      .delete()
      .eq("broadcast_id", id);

    const { data: updated, error: updErr } = await admin
      .from("broadcasts")
      .update({
        status: "draft",
        scheduled_at: null,
        total_recipients: 0,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
        clicked_count: 0,
        started_at: null,
        completed_at: null,
        updated_at: now,
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
      meta: { from: "scheduled", to: "draft" },
    });

    return NextResponse.json({ broadcast: updated });
  }

  // sending → cancelled; mark leftover pending as cancelled
  await admin
    .from("broadcast_recipients")
    .update({ status: "cancelled" })
    .eq("broadcast_id", id)
    .eq("status", "pending");

  const { data: updated, error: updErr } = await admin
    .from("broadcasts")
    .update({
      status: "cancelled",
      scheduled_at: null,
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
    meta: { from: "sending", to: "cancelled" },
  });

  return NextResponse.json({ broadcast: updated });
}
