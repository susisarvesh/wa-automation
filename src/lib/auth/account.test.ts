import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "user-mvp-1";

const listUsers = vi.fn();
const createUser = vi.fn();
const updateUserById = vi.fn();

function makeAdminClient() {
  const from = vi.fn((table: string) => {
    const result =
      table === "accounts"
        ? {
            data: {
              id: ACCOUNT_ID,
              name: "My Business",
              owner_user_id: USER_ID,
            },
            error: null,
          }
        : table === "profiles"
          ? { data: { id: "profile-1" }, error: null }
          : table === "tags"
            ? { data: { id: "tag-1" }, error: null }
            : { data: null, error: null };

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const m of [
      "select",
      "eq",
      "insert",
      "update",
      "upsert",
      "maybeSingle",
    ]) {
      builder[m] = vi.fn(chain);
    }
    builder.maybeSingle = vi.fn(async () => result);
    builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return builder;
  });

  return {
    auth: {
      admin: {
        listUsers,
        createUser,
        updateUserById,
      },
    },
    from,
  };
}

const supabaseAdmin = vi.fn(() => makeAdminClient());

vi.mock("@/lib/flows/admin-client", () => ({
  supabaseAdmin: () => supabaseAdmin(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const { getCurrentAccount, requireRole } = await import("./account");

beforeEach(() => {
  process.env.SINGLE_TENANT_MODE = "true";
  process.env.SINGLE_TENANT_ACCOUNT_ID = ACCOUNT_ID;
  listUsers.mockResolvedValue({
    data: { users: [{ id: USER_ID, email: "mvp@localhost.local" }] },
    error: null,
  });
  updateUserById.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  createUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentAccount — single-tenant MVP", () => {
  it("returns the fixed workspace as owner without a login session", async () => {
    const ctx = await getCurrentAccount();

    expect(ctx).toMatchObject({
      userId: USER_ID,
      accountId: ACCOUNT_ID,
      role: "owner",
      account: { id: ACCOUNT_ID, name: "My Business" },
    });
    expect(listUsers).toHaveBeenCalled();
  });

  it("requireRole always allows the MVP owner", async () => {
    const ctx = await requireRole("admin");
    expect(ctx.role).toBe("owner");
  });
});
