import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { writeAuditLog } from "@/lib/audit/log";
import {
  materializeRecipients,
  startBroadcastSending,
} from "@/lib/broadcasts/prepare";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

type Params = { params: Promise<{ id: string }> };

/**
 * Send now, or confirm schedule (if scheduled_at is in the future).
 * Body: { mode?: 'now' | 'schedule' }
 */
export async function POST(request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("agent");
  } catch (err) {
    return toErrorResponse(err);
  }

  const limit = checkRateLimit(
    `broadcast:${ctx.userId}`,
    RATE_LIMITS.broadcast,
  );
  if (!limit.success) return rateLimitResponse(limit);

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
  if (broadcast.status !== "draft" && broadcast.status !== "scheduled") {
    return NextResponse.json(
      { error: "Campaign is not in a sendable state" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const mode =
    body?.mode === "schedule"
      ? "schedule"
      : body?.mode === "now"
        ? "now"
        : broadcast.scheduled_at &&
            new Date(broadcast.scheduled_at).getTime() > Date.now()
          ? "schedule"
          : "now";

  try {
    const total = await materializeRecipients(admin, {
      id: broadcast.id,
      account_id: ctx.accountId,
      audience_filter: broadcast.audience_filter,
    });

    if (total === 0) {
      return NextResponse.json(
        { error: "No sendable contacts in this audience (need valid phones)" },
        { status: 400 },
      );
    }

    if (mode === "schedule") {
      const scheduledAt =
        typeof body?.scheduled_at === "string" && body.scheduled_at
          ? body.scheduled_at
          : broadcast.scheduled_at;

      if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "scheduled_at must be a future time" },
          { status: 400 },
        );
      }

      const { data: updated, error: updErr } = await admin
        .from("broadcasts")
        .update({
          status: "scheduled",
          scheduled_at: scheduledAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (updErr || !updated) {
        return NextResponse.json(
          { error: updErr?.message ?? "schedule failed" },
          { status: 500 },
        );
      }

      await writeAuditLog(admin, {
        action: "broadcast.schedule",
        actorUserId: ctx.userId,
        accountId: ctx.accountId,
        resourceType: "broadcast",
        resourceId: id,
        meta: { total, scheduledAt },
      });

      return NextResponse.json({ broadcast: updated });
    }

    await startBroadcastSending(admin, id, ctx.accountId);

    const { data: updated } = await admin
      .from("broadcasts")
      .select("*")
      .eq("id", id)
      .single();

    await writeAuditLog(admin, {
      action: "broadcast.send",
      actorUserId: ctx.userId,
      accountId: ctx.accountId,
      resourceType: "broadcast",
      resourceId: id,
      meta: { total },
    });

    return NextResponse.json({ broadcast: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
