import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { ensureUserWorkspace } from "@/lib/auth/workspace";

/**
 * Google OAuth callback — exchange code for session, ensure personal
 * workspace + access_grants row (pending unless platform admin), then
 * enter the app. Non-admin users are NOT signed out; they see the catalog
 * until approved.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/home";
  const safeNext = next.startsWith("/") ? next : "/home";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("[auth/callback] exchange failed:", error);
    return NextResponse.redirect(
      new URL("/login?error=oauth_failed", url.origin),
    );
  }

  try {
    await ensureUserWorkspace(supabaseAdmin(), data.user);
  } catch (err) {
    console.error("[auth/callback] workspace ensure failed:", err);
    const message =
      err instanceof Error ? err.message : "workspace";
    // Domain allowlist / hard failures should not leave a dangling session
    if (
      message.toLowerCase().includes("domain") ||
      message.toLowerCase().includes("not allowed")
    ) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(message)}`,
          url.origin,
        ),
      );
    }
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
