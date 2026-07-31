import { describe, expect, it } from "vitest";
import { getPlatformAdminEmails, isPlatformAdmin } from "./single-tenant";
import { isAccessApproved } from "./access-grants";

describe("platform admin", () => {
  it("defaults to vsmarttechindia@gmail.com", () => {
    const prev = process.env.PLATFORM_ADMIN_EMAILS;
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(getPlatformAdminEmails()).toContain("vsmarttechindia@gmail.com");
    expect(isPlatformAdmin("vsmarttechindia@gmail.com")).toBe(true);
    expect(isPlatformAdmin("other@gmail.com")).toBe(false);
    if (prev === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = prev;
  });
});

describe("access grant status", () => {
  it("only approved is allowed for writes", () => {
    expect(isAccessApproved("approved")).toBe(true);
    expect(isAccessApproved("pending")).toBe(false);
    expect(isAccessApproved("revoked")).toBe(false);
    expect(isAccessApproved(null)).toBe(false);
  });
});
