import { NextResponse } from "next/server";
import {
  requirePlatformAdmin,
  toErrorResponse,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { writeAuditLog } from "@/lib/audit/log";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/**
 * GET /api/admin/invites — list pending platform invites
 * POST /api/admin/invites — { email } invite-by-email (auto-approve on login)
 * DELETE /api/admin/invites — { email } revoke pending invite
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("platform_invites")
      .select("id, email, status, created_at, accepted_at, invited_by")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ invites: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const rl = checkRateLimit(
      `admin:invites:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!rl.success) return rateLimitResponse(rl);

    const body = (await request.json().catch(() => null)) as {
      email?: string;
    } | null;
    const email = body?.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("platform_invites")
      .upsert(
        {
          email,
          invited_by: ctx.userId,
          status: "pending",
          accepted_at: null,
        },
        { onConflict: "email" },
      )
      .select("id, email, status")
      .maybeSingle();

    // upsert onConflict needs unique on email — we only have partial unique.
    // Fall back to insert / update manually if upsert fails.
    if (error) {
      const { data: existing } = await admin
        .from("platform_invites")
        .select("id")
        .ilike("email", email)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          ok: true,
          invite: { id: existing.id, email, status: "pending" },
        });
      }
      const { data: created, error: insErr } = await admin
        .from("platform_invites")
        .insert({
          email,
          invited_by: ctx.userId,
          status: "pending",
        })
        .select("id, email, status")
        .single();
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      await writeAuditLog(admin, {
        action: "access.pending",
        actorUserId: ctx.userId,
        accountId: ctx.accountId,
        resourceType: "platform_invites",
        resourceId: created.id,
        meta: { email, kind: "invite" },
      });
      return NextResponse.json({ ok: true, invite: created });
    }

    await writeAuditLog(admin, {
      action: "access.pending",
      actorUserId: ctx.userId,
      accountId: ctx.accountId,
      resourceType: "platform_invites",
      resourceId: data?.id,
      meta: { email, kind: "invite" },
    });
    return NextResponse.json({ ok: true, invite: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const body = (await request.json().catch(() => null)) as {
      email?: string;
    } | null;
    const email = body?.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }
    const admin = supabaseAdmin();
    await admin
      .from("platform_invites")
      .update({ status: "revoked" })
      .ilike("email", email)
      .eq("status", "pending");

    await writeAuditLog(admin, {
      action: "access.revoke",
      actorUserId: ctx.userId,
      accountId: ctx.accountId,
      resourceType: "platform_invites",
      meta: { email, kind: "invite_revoke" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
