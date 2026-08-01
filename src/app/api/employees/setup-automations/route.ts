import { NextResponse } from "next/server";
import {
  requireGranted,
  toErrorResponse,
  type AccountContext,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { insertSteps, type BuilderStepInput } from "@/lib/automations/steps-tree";

/**
 * POST /api/employees/setup-automations
 * Idempotent quick-setup: welcome (services menu) + FAQ keyword automation
 * on the company WhatsApp number for this account.
 */
export async function POST(request: Request) {
  let ctx: AccountContext;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => ({}));
  const servicesText =
    typeof body.services_message === "string" && body.services_message.trim()
      ? body.services_message.trim()
      : [
          "Welcome to vSmart Technologies! How can we help?",
          "",
          "Reply with a number:",
          "1) Website / app development",
          "2) WhatsApp automation & CRM",
          "3) Support / ticket",
          "4) Talk to a person",
        ].join("\n");

  const faqText =
    typeof body.faq_message === "string" && body.faq_message.trim()
      ? body.faq_message.trim()
      : "Happy to help. Ask about pricing, support hours, or services — or reply with 1–4 from our menu.";

  const admin = supabaseAdmin();
  const created: string[] = [];
  const skipped: string[] = [];

  async function ensureAutomation(input: {
    name: string;
    description: string;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    steps: BuilderStepInput[];
  }) {
    const { data: existing } = await admin
      .from("automations")
      .select("id")
      .eq("account_id", ctx.accountId)
      .eq("name", input.name)
      .maybeSingle();

    if (existing) {
      skipped.push(input.name);
      return existing.id as string;
    }

    const { data: automation, error } = await admin
      .from("automations")
      .insert({
        user_id: ctx.userId,
        account_id: ctx.accountId,
        name: input.name,
        description: input.description,
        trigger_type: input.trigger_type,
        trigger_config: input.trigger_config,
        is_active: true,
      })
      .select("id")
      .single();

    if (error || !automation) {
      throw new Error(error?.message ?? `Failed to create ${input.name}`);
    }

    const err = await insertSteps(automation.id, input.steps);
    if (err) throw new Error(err);
    created.push(input.name);
    return automation.id as string;
  }

  try {
    await ensureAutomation({
      name: "Company services menu",
      description:
        "Greets first-time messagers on the company WhatsApp number with a services menu.",
      trigger_type: "first_inbound_message",
      trigger_config: {},
      steps: [
        {
          step_type: "send_message",
          step_config: { text: servicesText },
        },
      ],
    });

    await ensureAutomation({
      name: "Company FAQ replies",
      description:
        "Keyword replies for common field/support questions on the company number.",
      trigger_type: "keyword_match",
      trigger_config: {
        keywords: [
          "help",
          "support",
          "hours",
          "pricing",
          "price",
          "services",
          "product",
          "hi",
          "hello",
          "faq",
        ],
        match_type: "contains",
      },
      steps: [
        {
          step_type: "send_message",
          step_config: { text: faqText },
        },
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    message:
      created.length > 0
        ? `Activated: ${created.join(", ")}`
        : "Services automations already exist for this workspace.",
  });
}
