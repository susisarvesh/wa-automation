import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/auth/errors";

process.env.SINGLE_TENANT_MODE = "false";
process.env.AUTH_PROVIDER = "google";
process.env.NEXT_PUBLIC_AUTH_PROVIDER = "google";

const requireGranted = vi.fn();
const requireRole = vi.fn();
const writeAuditLog = vi.fn();

vi.mock("@/lib/auth/account", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/account")>(
    "@/lib/auth/account",
  );
  return {
    ...actual,
    requireGranted: (...args: unknown[]) => requireGranted(...args),
    requireRole: (...args: unknown[]) => requireRole(...args),
  };
});

vi.mock("@/lib/automations/admin-client", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const { POST } = await import("./route");

beforeEach(() => {
  requireGranted.mockReset();
  requireRole.mockReset();
  writeAuditLog.mockReset();
});

describe("POST /api/broadcasts", () => {
  it("rejects pending (unapproved) users via requireGranted", async () => {
    requireGranted.mockRejectedValue(
      new ForbiddenError(
        "Your account is waiting for admin approval. You can browse what's available, but can't connect WhatsApp or create automations yet.",
      ),
    );

    const res = await POST(
      new Request("https://app.test/api/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          name: "Test",
          template_name: "hello",
          audience_filter: { tag_ids: ["t1"] },
        }),
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/approval/i);
    expect(requireGranted).toHaveBeenCalledWith("agent");
  });
});
