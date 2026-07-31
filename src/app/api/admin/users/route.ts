import { NextResponse } from "next/server";
import {
  requirePlatformAdmin,
  toErrorResponse,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/flows/admin-client";

/**
 * GET /api/admin/users — platform admin: list profiles + grant status.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const admin = supabaseAdmin();

    const { data: profiles, error } = await admin
      .from("profiles")
      .select("user_id, email, full_name, account_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[admin/users]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: grants } = await admin
      .from("access_grants")
      .select("user_id, status, decided_at, created_at");

    const grantByUser = new Map(
      (grants ?? []).map((g) => [g.user_id as string, g]),
    );

    const users = (profiles ?? []).map((p) => {
      const g = grantByUser.get(p.user_id as string);
      return {
        userId: p.user_id,
        email: p.email,
        fullName: p.full_name,
        accountId: p.account_id,
        joinedAt: p.created_at,
        accessStatus: (g?.status as string) || "pending",
        decidedAt: g?.decided_at ?? null,
        grantCreatedAt: g?.created_at ?? null,
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    return toErrorResponse(err);
  }
}
