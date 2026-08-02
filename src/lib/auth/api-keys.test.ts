import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, hasScope } from "./api-keys";

describe("api-keys", () => {
  it("generates wak_ tokens with stable hash", () => {
    const { plaintext, tokenHash, tokenPrefix } = generateApiKey();
    expect(plaintext.startsWith("wak_")).toBe(true);
    expect(tokenPrefix.startsWith("wak_")).toBe(true);
    expect(plaintext.startsWith(tokenPrefix)).toBe(true);
    expect(hashApiKey(plaintext)).toBe(tokenHash);
  });

  it("checks scopes", () => {
    expect(hasScope(["messages:send"], "messages:send")).toBe(true);
    expect(hasScope(["account:read"], "messages:send")).toBe(false);
  });
});
