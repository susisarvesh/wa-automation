import { describe, expect, it } from "vitest";
import {
  mergeButtonParams,
  mergeParamList,
  mergeParamString,
} from "./merge-params";

describe("mergeParamString", () => {
  it("replaces contact name, phone, company, and email", () => {
    expect(
      mergeParamString(
        "Hi {{contact.name}} at {{contact.company}} ({{contact.phone}}) {{contact.email}}",
        {
          name: "Ada",
          phone: "+15551212",
          company: "Vsmart",
          email: "ada@vsmarttec.com",
        },
      ),
    ).toBe("Hi Ada at Vsmart (+15551212) ada@vsmarttec.com");
  });

  it("uses empty string for missing fields", () => {
    expect(mergeParamString("{{contact.name}}", { phone: "+1" })).toBe("");
    expect(mergeParamString("{{contact.company}}", { name: "Ada" })).toBe("");
  });

  it("leaves unrelated braces alone", () => {
    expect(mergeParamString("Order {{1}}", { name: "Ada" })).toBe("Order {{1}}");
  });
});

describe("mergeParamList / mergeButtonParams", () => {
  it("maps lists", () => {
    expect(
      mergeParamList(["{{contact.name}}", "{{contact.company}}"], {
        name: "Bo",
        company: "Acme",
      }),
    ).toEqual(["Bo", "Acme"]);
  });

  it("maps button params by index", () => {
    expect(
      mergeButtonParams({ 0: "{{contact.phone}}" }, { phone: "+99" }),
    ).toEqual({ 0: "+99" });
  });
});
