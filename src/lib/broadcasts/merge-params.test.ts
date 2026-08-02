import { describe, expect, it } from "vitest";
import {
  mergeButtonParams,
  mergeParamList,
  mergeParamString,
} from "./merge-params";

describe("mergeParamString", () => {
  it("replaces contact name and phone", () => {
    expect(
      mergeParamString("Hi {{contact.name}} at {{contact.phone}}", {
        name: "Ada",
        phone: "+15551212",
      }),
    ).toBe("Hi Ada at +15551212");
  });

  it("uses empty string for missing fields", () => {
    expect(mergeParamString("{{contact.name}}", { phone: "+1" })).toBe("");
  });

  it("leaves unrelated braces alone", () => {
    expect(mergeParamString("Order {{1}}", { name: "Ada" })).toBe("Order {{1}}");
  });
});

describe("mergeParamList / mergeButtonParams", () => {
  it("maps lists", () => {
    expect(
      mergeParamList(["{{contact.name}}", "static"], { name: "Bo" }),
    ).toEqual(["Bo", "static"]);
  });

  it("maps button params by index", () => {
    expect(
      mergeButtonParams({ 0: "{{contact.phone}}" }, { phone: "+99" }),
    ).toEqual({ 0: "+99" });
  });
});
