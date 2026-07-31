import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { attachUserToWorkspace } from "@/lib/auth/workspace";
import { ForbiddenError } from "@/lib/auth/errors";

/**
 * Google OAuth callback — exchange code for session, attach user to
 * the fixed Vsmart workspace, then redirect into the app.
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
    await attachUserToWorkspace(supabaseAdmin(), data.user);
  } catch (err) {
    console.error("[auth/callback] workspace attach failed:", err);
    await supabase.auth.signOut();
    const msg =
      err instanceof ForbiddenError
        ? encodeURIComponent(err.message)
        : "workspace";
    return NextResponse.redirect(
      new URL(`/login?error=${msg}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
