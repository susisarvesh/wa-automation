import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function authProvider(): "google" | "none" {
  const raw = (process.env.AUTH_PROVIDER || "google").toLowerCase().trim();
  return raw === "none" ? "none" : "google";
}

function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Never allow open-demo (token minting) on production deploys
  if (
    isVercelProduction() &&
    authProvider() === "none" &&
    path.startsWith("/api/mvp/")
  ) {
    return NextResponse.json(
      { error: "Open demo is disabled in production" },
      { status: 403 },
    );
  }

  // Open demo — no login gates (legacy auth URLs → home)
  if (authProvider() === "none") {
    if (
      path === "/login" ||
      path === "/signup" ||
      path === "/forgot-password" ||
      path.startsWith("/join/") ||
      path.startsWith("/auth/")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (path === "/dashboard") {
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ---- Google auth ----
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  if (path === "/dashboard") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // Logged-in users leave the login page
  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  const protectedPaths = [
    "/home",
    "/inbox",
    "/contacts",
    "/employees",
    "/automations",
    "/broadcasts",
    "/settings",
    "/connect",
    "/admin",
  ];
  if (
    !user &&
    protectedPaths.some((p) => path === p || path.startsWith(`${p}/`))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return withRefreshedCookies(NextResponse.redirect(url));
  }

  // Protect app APIs (webhook + cron stay public; cron routes auth themselves)
  if (
    !user &&
    path.startsWith("/api/") &&
    !path.startsWith("/api/whatsapp/webhook") &&
    !path.startsWith("/api/automations/cron") &&
    !path.startsWith("/api/cron/") &&
    !path.startsWith("/api/mvp/")
  ) {
    return withRefreshedCookies(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
