import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const { middleware } = await import("./middleware");

describe("middleware — single-tenant MVP redirects", () => {
  it("redirects legacy auth URLs to /home", async () => {
    for (const path of ["/login", "/signup", "/forgot-password", "/join/abc"]) {
      const res = await middleware(new NextRequest(`https://app.test${path}`));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/home");
    }
  });

  it("redirects /dashboard to /home", async () => {
    const res = await middleware(
      new NextRequest("https://app.test/dashboard"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/home");
  });

  it("passes through MVP pages", async () => {
    const res = await middleware(new NextRequest("https://app.test/home"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });
});
