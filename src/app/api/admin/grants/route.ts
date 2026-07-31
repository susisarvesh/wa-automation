import { NextResponse } from "next/server";
import {
  requirePlatformAdmin,
  toErrorResponse,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { setAccessGrantStatus } from "@/lib/auth/access-grants";
import { writeAuditLog } from "@/lib/audit/log";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

/**
 * POST /api/admin/grants
 * Body: { userId: string, action: "approve" | "revoke" }
 */
export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdmin();
    const rl = checkRateLimit(
      `admin:grants:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!rl.success) return rateLimitResponse(rl);

    const body = (await request.json().catch(() => null)) as {
      userId?: string;
      action?: string;
    } | null;

    const userId = body?.userId?.trim();
    const action = body?.action;
    if (!userId || (action !== "approve" && action !== "revoke")) {
      return NextResponse.json(
        { error: "Expected { userId, action: 'approve' | 'revoke' }" },
        { status: 400 },
      );
    }

    if (userId === ctx.userId && action === "revoke") {
      return NextResponse.json(
        { error: "You cannot revoke your own admin access" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();

    const status = action === "approve" ? "approved" : "revoked";
    await setAccessGrantStatus(admin, {
      userId,
      status,
      decidedBy: ctx.userId,
      email: (profile?.email as string) || undefined,
    });

    await writeAuditLog(admin, {
      action: action === "approve" ? "access.approve" : "access.revoke",
      actorUserId: ctx.userId,
      accountId: ctx.accountId,
      resourceType: "access_grants",
      resourceId: userId,
      meta: {
        email: profile?.email ?? null,
        status,
      },
      ip: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({
      ok: true,
      userId,
      status,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
