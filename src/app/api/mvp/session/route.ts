import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import {
  isOpenDemoMode,
  SINGLE_TENANT_EMAIL,
} from "@/lib/auth/single-tenant";

/**
 * Issues a Supabase session for the open-demo MVP user so the
 * browser anon client can pass RLS without a login screen.
 * Disabled when AUTH_PROVIDER=google.
 */
export async function GET() {
  if (!isOpenDemoMode()) {
    return NextResponse.json(
      { error: "Open demo session is disabled. Sign in with Google." },
      { status: 403 },
    );
  }

  try {
    await getCurrentAccount(); // ensures user + account exist

    const password =
      process.env.SINGLE_TENANT_PASSWORD || "mvp-dev-only-change-me";

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Ensure password is set (createUser may have used a random one).
    const { supabaseAdmin } = await import("@/lib/flows/admin-client");
    const admin = supabaseAdmin();
    const { data: listed } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const user = listed?.users?.find((u) => u.email === SINGLE_TENANT_EMAIL);
    if (user) {
      await admin.auth.admin.updateUserById(user.id, { password });
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: SINGLE_TENANT_EMAIL,
      password,
    });

    if (error || !data.session) {
      console.error("[mvp/session] sign-in failed:", error);
      return NextResponse.json(
        { error: error?.message ?? "Could not start session" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      account_id: process.env.SINGLE_TENANT_ACCOUNT_ID,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
