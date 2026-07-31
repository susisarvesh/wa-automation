import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const { middleware } = await import("./middleware");

afterEach(() => {
  process.env.AUTH_PROVIDER = "none";
});

describe("middleware — open demo (AUTH_PROVIDER=none)", () => {
  it("redirects legacy auth URLs to /home", async () => {
    process.env.AUTH_PROVIDER = "none";
    for (const path of ["/login", "/signup", "/forgot-password", "/join/abc"]) {
      const res = await middleware(new NextRequest(`https://app.test${path}`));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/home");
    }
  });

  it("redirects /dashboard to /home", async () => {
    process.env.AUTH_PROVIDER = "none";
    const res = await middleware(
      new NextRequest("https://app.test/dashboard"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/home");
  });

  it("passes through MVP pages", async () => {
    process.env.AUTH_PROVIDER = "none";
    const res = await middleware(new NextRequest("https://app.test/home"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });
});

describe("middleware — Google auth", () => {
  it("redirects unauthenticated /home to /login", async () => {
    process.env.AUTH_PROVIDER = "google";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const res = await middleware(new NextRequest("https://app.test/home"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(loc).toContain("next=%2Fhome");
  });

  it("returns 401 for unauthenticated app APIs", async () => {
    process.env.AUTH_PROVIDER = "google";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const res = await middleware(
      new NextRequest("https://app.test/api/whatsapp/config"),
    );
    expect(res.status).toBe(401);
  });

  it("allows webhook without session", async () => {
    process.env.AUTH_PROVIDER = "google";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const res = await middleware(
      new NextRequest("https://app.test/api/whatsapp/webhook"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("allows cron keepalive without session", async () => {
    process.env.AUTH_PROVIDER = "google";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const res = await middleware(
      new NextRequest("https://app.test/api/cron/keepalive"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
