import { NextResponse } from "next/server";
import {
  requirePlatformAdmin,
  toErrorResponse,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { setAccessGrantStatus } from "@/lib/auth/access-grants";

/**
 * POST /api/admin/grants
 * Body: { userId: string, action: "approve" | "revoke" }
 */
export async function POST(request: Request) {
  try {
    const ctx = await requirePlatformAdmin();
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

    await setAccessGrantStatus(admin, {
      userId,
      status: action === "approve" ? "approved" : "revoked",
      decidedBy: ctx.userId,
      email: (profile?.email as string) || undefined,
    });

    return NextResponse.json({
      ok: true,
      userId,
      status: action === "approve" ? "approved" : "revoked",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
