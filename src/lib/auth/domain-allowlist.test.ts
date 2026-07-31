import { afterEach, describe, expect, it } from "vitest";
import {
  getAllowedDomains,
  isEmailDomainAllowed,
} from "./domain-allowlist";

afterEach(() => {
  delete process.env.AUTH_ALLOWED_DOMAINS;
});

describe("domain allowlist", () => {
  it("allows any domain when unset", () => {
    expect(getAllowedDomains()).toEqual([]);
    expect(isEmailDomainAllowed("a@anywhere.com")).toBe(true);
  });

  it("restricts when configured", () => {
    process.env.AUTH_ALLOWED_DOMAINS = "vsmarttec.com, @Partner.COM";
    expect(getAllowedDomains()).toEqual(["vsmarttec.com", "partner.com"]);
    expect(isEmailDomainAllowed("x@vsmarttec.com")).toBe(true);
    expect(isEmailDomainAllowed("x@partner.com")).toBe(true);
    expect(isEmailDomainAllowed("x@gmail.com")).toBe(false);
  });
});
