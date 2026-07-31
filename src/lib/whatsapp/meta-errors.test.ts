import { describe, expect, it } from "vitest";
import { humanizeMetaError } from "./meta-errors";

describe("humanizeMetaError", () => {
  it("maps expired tokens", () => {
    expect(
      humanizeMetaError("Error validating access token: Session has expired"),
    ).toMatch(/token expired/i);
  });

  it("maps wrong phone number id", () => {
    expect(
      humanizeMetaError(
        "Unsupported get request. Object with ID '123' does not exist",
      ),
    ).toMatch(/phone number id/i);
  });

  it("maps recipient allowlist", () => {
    expect(humanizeMetaError("(#131030) Recipient phone number not in allowed list")).toMatch(
      /recipient/i,
    );
  });
});
