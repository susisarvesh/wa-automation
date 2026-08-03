import { describe, expect, it } from "vitest";
import {
  buildTrackedUrlButtonParam,
  looksLikeTrackedDestination,
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

  it("replaces custom field keys", () => {
    expect(
      mergeParamString("Site {{contact.custom.site_code}}", {
        custom: { site_code: "BLR-01" },
      }),
    ).toBe("Site BLR-01");
  });

  it("uses empty string for missing fields", () => {
    expect(mergeParamString("{{contact.name}}", { phone: "+1" })).toBe("");
    expect(mergeParamString("{{contact.company}}", { name: "Ada" })).toBe("");
    expect(
      mergeParamString("{{contact.custom.missing}}", { custom: {} }),
    ).toBe("");
  });

  it("leaves unrelated braces alone", () => {
    expect(mergeParamString("Order {{1}}", { name: "Ada" })).toBe("Order {{1}}");
  });
});

describe("mergeParamList / mergeButtonParams", () => {
  it("maps lists", () => {
    expect(
      mergeParamList(["{{contact.name}}", "{{contact.custom.x}}"], {
        name: "Bo",
        custom: { x: "Y" },
      }),
    ).toEqual(["Bo", "Y"]);
  });

  it("maps button params by index", () => {
    expect(
      mergeButtonParams({ 0: "{{contact.phone}}" }, { phone: "+99" }),
    ).toEqual({ 0: "+99" });
  });
});

describe("tracked URL helpers", () => {
  it("detects absolute destinations", () => {
    expect(looksLikeTrackedDestination("https://x.com/a")).toBe(true);
    expect(looksLikeTrackedDestination("http://x.com")).toBe(true);
    expect(looksLikeTrackedDestination("ORD-42")).toBe(false);
    expect(looksLikeTrackedDestination("/path")).toBe(false);
  });

  it("builds tracker suffix", () => {
    expect(
      buildTrackedUrlButtonParam({
        broadcastId: "b1",
        recipientId: "r1",
        destination: "https://x.com/a?b=1",
      }),
    ).toBe("b1/r1?u=https%3A%2F%2Fx.com%2Fa%3Fb%3D1");
  });
});
