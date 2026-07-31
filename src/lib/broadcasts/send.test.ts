import { beforeEach, describe, expect, it, vi } from "vitest";

const sendTemplateMessage = vi.fn();
const enqueueJob = vi.fn();

vi.mock("@/lib/whatsapp/meta-api", () => ({
  sendTemplateMessage: (...args: unknown[]) => sendTemplateMessage(...args),
}));

vi.mock("@/lib/whatsapp/encryption", () => ({
  decrypt: (v: string) => v,
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: (...args: unknown[]) => enqueueJob(...args),
}));

vi.mock("@/lib/whatsapp/template-row-guard", () => ({
  isMessageTemplate: () => false,
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const recipientUpdates: Array<{ id: string; status: string }> = [];

function makeAdmin() {
  const broadcast = {
    id: "b1",
    account_id: "acct-1",
    status: "sending",
    template_name: "hello",
    template_language: "en_US",
    template_variables: { body: ["Ada"] },
    started_at: new Date().toISOString(),
  };

  const recipients = [
    {
      id: "r1",
      contact_id: "c1",
      contact: { id: "c1", phone: "+15551111111" },
    },
    {
      id: "r2",
      contact_id: "c2",
      contact: { id: "c2", phone: "+15552222222" },
    },
  ];

  return {
    from: vi.fn((table: string) => {
      const state: {
        filters: Record<string, unknown>;
        op: "select" | "update" | "insert";
      } = { filters: {}, op: "select" };

      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of [
        "select",
        "eq",
        "in",
        "order",
        "limit",
        "maybeSingle",
        "single",
      ]) {
        builder[m] = vi.fn((...args: unknown[]) => {
          if (m === "select") state.op = "select";
          if (m === "eq" && args[0] === "id") state.filters.id = args[1];
          if (m === "eq" && args[0] === "status") state.filters.status = args[1];
          return builder;
        });
      }

      builder.update = vi.fn((patch: Record<string, unknown>) => {
        state.op = "update";
        state.filters.patch = patch;
        return builder;
      });

      builder.maybeSingle = vi.fn(async () => {
        if (table === "broadcasts") {
          return { data: broadcast, error: null };
        }
        if (table === "whatsapp_config") {
          return {
            data: {
              phone_number_id: "pnid",
              access_token: "token",
            },
            error: null,
          };
        }
        if (table === "message_templates") {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      });

      builder.then = (resolve: (v: unknown) => unknown) => {
        if (table === "broadcast_recipients" && state.op === "select") {
          if (state.filters.status === "pending") {
            return resolve({ data: recipients, error: null, count: 0 });
          }
          // remaining / fail / sent counts
          return resolve({ data: [], error: null, count: 0 });
        }
        if (table === "broadcast_recipients" && state.op === "update") {
          const patch = state.filters.patch as { status?: string };
          const id = state.filters.id as string;
          if (id && patch?.status) {
            recipientUpdates.push({ id, status: patch.status });
          }
          return resolve({ data: null, error: null });
        }
        if (table === "broadcasts" && state.op === "update") {
          return resolve({ data: null, error: null });
        }
        return resolve({ data: null, error: null, count: 0 });
      };

      return builder;
    }),
  };
}

const { processBroadcastSendBatch } = await import("./send");

beforeEach(() => {
  recipientUpdates.length = 0;
  sendTemplateMessage.mockReset();
  enqueueJob.mockReset();
});

describe("processBroadcastSendBatch", () => {
  it("marks a recipient failed on Meta error without aborting the campaign", async () => {
    sendTemplateMessage
      .mockRejectedValueOnce(new Error("Meta 400 bad request"))
      .mockResolvedValueOnce({ messageId: "wamid.ok" });

    const result = await processBroadcastSendBatch(makeAdmin() as never, "b1");

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(sendTemplateMessage).toHaveBeenCalledTimes(2);
    expect(recipientUpdates).toEqual(
      expect.arrayContaining([
        { id: "r1", status: "failed" },
        { id: "r2", status: "sent" },
      ]),
    );
  });
});
