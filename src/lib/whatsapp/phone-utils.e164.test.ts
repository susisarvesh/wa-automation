import { describe, expect, it } from "vitest";
import { parseE164ToCcAndNational } from "./phone-utils";

describe("parseE164ToCcAndNational", () => {
  it("splits Indian numbers", () => {
    expect(parseE164ToCcAndNational("+919790985447")).toEqual({
      e164Digits: "919790985447",
      cc: "91",
      nationalNumber: "9790985447",
    });
  });

  it("splits US numbers", () => {
    expect(parseE164ToCcAndNational("+15551234567")).toEqual({
      e164Digits: "15551234567",
      cc: "1",
      nationalNumber: "5551234567",
    });
  });

  it("rejects invalid input", () => {
    expect(parseE164ToCcAndNational("abc")).toBeNull();
  });
});
