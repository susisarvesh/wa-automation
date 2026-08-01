import { describe, expect, it, vi } from "vitest";
import { resolveWhatsAppConfig } from "./resolve-config";

function mockDb(handlers: Record<string, unknown>) {
  return {
    from: (table: string) => {
      if (table !== "whatsapp_config") {
        throw new Error(`unexpected table ${table}`);
      }
      return handlers;
    },
  } as never;
}

describe("resolveWhatsAppConfig", () => {
  it("returns the row matching phone_number_id when provided", async () => {
    const row = {
      id: "a",
      account_id: "acc",
      phone_number_id: "111",
      is_primary: false,
    };
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: row, error: null }),
    };
    const result = await resolveWhatsAppConfig(
      mockDb(chain),
      "acc",
      "111",
    );
    expect(result?.phone_number_id).toBe("111");
  });

  it("falls back to primary then oldest", async () => {
    const primary = {
      id: "p",
      account_id: "acc",
      phone_number_id: "222",
      is_primary: true,
    };
    let eqCalls = 0;
    const chain = {
      select: () => chain,
      eq: () => {
        eqCalls += 1;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: vi
        .fn()
        // first: explicit phone miss
        .mockResolvedValueOnce({ data: null, error: null })
        // second: primary hit
        .mockResolvedValueOnce({ data: primary, error: null }),
    };
    const result = await resolveWhatsAppConfig(
      mockDb(chain),
      "acc",
      "missing",
    );
    expect(result?.id).toBe("p");
    expect(eqCalls).toBeGreaterThan(0);
  });
});
