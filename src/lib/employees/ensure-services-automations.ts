import { supabaseAdmin } from "@/lib/automations/admin-client";
import { insertSteps, type BuilderStepInput } from "@/lib/automations/steps-tree";

const DEFAULT_SERVICES = [
  "Welcome to vSmart Technologies! How can we help?",
  "",
  "Reply with a number:",
  "1) Website / app development",
  "2) WhatsApp automation & CRM",
  "3) Support / ticket",
  "4) Talk to a person",
].join("\n");

const DEFAULT_FAQ =
  "Happy to help. Ask about pricing, support hours, or services — or reply with 1–4 from our menu.";

export async function ensureCompanyServicesAutomations(args: {
  accountId: string;
  userId: string;
  servicesText?: string;
  faqText?: string;
}): Promise<{ created: string[]; skipped: string[] }> {
  const admin = supabaseAdmin();
  const created: string[] = [];
  const skipped: string[] = [];
  const servicesText = args.servicesText?.trim() || DEFAULT_SERVICES;
  const faqText = args.faqText?.trim() || DEFAULT_FAQ;

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
      .eq("account_id", args.accountId)
      .eq("name", input.name)
      .maybeSingle();

    if (existing) {
      skipped.push(input.name);
      // Ensure it's active when re-running from employee WhatsApp verify.
      await admin
        .from("automations")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return existing.id as string;
    }

    const { data: automation, error } = await admin
      .from("automations")
      .insert({
        user_id: args.userId,
        account_id: args.accountId,
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

  await admin
    .from("automations")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("account_id", args.accountId)
    .eq("is_active", true)
    .in("name", ["FAQ Auto Reply", "FAQ Auto Reply (Copy)"]);

  return { created, skipped };
}
