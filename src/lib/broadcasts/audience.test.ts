import { describe, expect, it, vi } from "vitest";
import {
  parseAudienceFilter,
  resolveAudienceContactIds,
} from "./audience";

describe("parseAudienceFilter", () => {
  it("accepts mode all", () => {
    expect(parseAudienceFilter({ mode: "all" })).toEqual({ mode: "all" });
  });

  it("accepts unique tag_ids with mode tags", () => {
    expect(
      parseAudienceFilter({ mode: "tags", tag_ids: ["a", "a", "b"] }),
    ).toEqual({
      mode: "tags",
      tag_ids: ["a", "b"],
    });
  });

  it("accepts legacy tag_ids without mode", () => {
    expect(parseAudienceFilter({ tag_ids: ["a"] })).toEqual({
      mode: "tags",
      tag_ids: ["a"],
    });
  });

  it("rejects empty / invalid", () => {
    expect(parseAudienceFilter(null)).toBeNull();
    expect(parseAudienceFilter({})).toBeNull();
    expect(parseAudienceFilter({ tag_ids: [] })).toBeNull();
    expect(parseAudienceFilter({ mode: "tags", tag_ids: [] })).toBeNull();
    expect(parseAudienceFilter({ tag_ids: [1] })).toBeNull();
  });
});

describe("resolveAudienceContactIds", () => {
  it("returns distinct contacts matching any valid tag (OR)", async () => {
    const from = vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "in", "range"]) {
        builder[m] = vi.fn(chain);
      }
      if (table === "tags") {
        builder.then = (resolve: (v: unknown) => unknown) =>
          resolve({
            data: [{ id: "tag-1" }, { id: "tag-2" }],
            error: null,
          });
      } else {
        builder.then = (resolve: (v: unknown) => unknown) =>
          resolve({
            data: [
              { contact_id: "c1" },
              { contact_id: "c2" },
              { contact_id: "c1" },
            ],
            error: null,
          });
      }
      return builder;
    });

    const ids = await resolveAudienceContactIds(
      { from } as never,
      "acct-1",
      { mode: "tags", tag_ids: ["tag-1", "tag-2", "missing"] },
    );
    expect(ids.sort()).toEqual(["c1", "c2"]);
  });

  it("lists all contacts for mode all", async () => {
    const from = vi.fn(() => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "range"]) {
        builder[m] = vi.fn(chain);
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: [{ id: "c1" }, { id: "c2" }],
          error: null,
        });
      return builder;
    });

    const ids = await resolveAudienceContactIds(
      { from } as never,
      "acct-1",
      { mode: "all" },
    );
    expect(ids).toEqual(["c1", "c2"]);
  });
});
