import { describe, expect, it } from "vitest";
import { resolveBodyParamsForContact } from "./merge-params";

describe("resolveBodyParamsForContact", () => {
  it("substitutes name and phone tokens", () => {
    expect(
      resolveBodyParamsForContact(
        ["Hi {{contact.name}}", "{{contact.phone}}", "fixed"],
        { name: "Ada", phone: "+919999999999" },
      ),
    ).toEqual(["Hi Ada", "+919999999999", "fixed"]);
  });
});
