import { NextResponse } from "next/server";
import {
  requireGranted,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { writeAuditLog } from "@/lib/audit/log";
import { parseAudienceFilter } from "@/lib/broadcasts/audience";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const { data, error } = await ctx.supabase
      .from("broadcasts")
      .select("*")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ broadcasts: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireGranted("agent");
  } catch (err) {
    return toErrorResponse(err);
  }

  const limit = checkRateLimit(
    `broadcast:${ctx.userId}`,
    RATE_LIMITS.broadcast,
  );
  if (!limit.success) return rateLimitResponse(limit);

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name =
    typeof body.name === "string" ? body.name.trim() : "";
  const templateName =
    typeof body.template_name === "string" ? body.template_name.trim() : "";
  const templateLanguage =
    typeof body.template_language === "string" && body.template_language
      ? body.template_language
      : "en_US";

  if (!name || !templateName) {
    return NextResponse.json(
      { error: "name and template_name are required" },
      { status: 400 },
    );
  }

  const audience = parseAudienceFilter(body.audience_filter);
  if (!audience) {
    return NextResponse.json(
      {
        error:
          'audience_filter must be { mode: "all" } or { mode: "tags", tag_ids: [...] }',
      },
      { status: 400 },
    );
  }

  const bodyVars = Array.isArray(body.body_params)
    ? body.body_params.map((p: unknown) => String(p ?? ""))
    : Array.isArray(body.template_variables?.body)
      ? body.template_variables.body.map((p: unknown) => String(p ?? ""))
      : [];

  const scheduledAt =
    typeof body.scheduled_at === "string" && body.scheduled_at
      ? body.scheduled_at
      : null;

  const admin = supabaseAdmin();

  // Prefer APPROVED templates only
  const { data: tmpl } = await admin
    .from("message_templates")
    .select("id, status, name, language")
    .eq("account_id", ctx.accountId)
    .eq("name", templateName)
    .eq("language", templateLanguage)
    .maybeSingle();

  if (!tmpl) {
    return NextResponse.json(
      { error: "Template not found for this account" },
      { status: 400 },
    );
  }
  if (String(tmpl.status).toUpperCase() !== "APPROVED") {
    return NextResponse.json(
      { error: "Only APPROVED templates can be used for campaigns" },
      { status: 400 },
    );
  }

  const { data: broadcast, error } = await admin
    .from("broadcasts")
    .insert({
      user_id: ctx.userId,
      account_id: ctx.accountId,
      name,
      template_name: templateName,
      template_language: templateLanguage,
      template_variables: { body: bodyVars },
      audience_filter: audience,
      scheduled_at: scheduledAt,
      status: "draft",
    })
    .select("*")
    .single();

  if (error || !broadcast) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  await writeAuditLog(admin, {
    action: "broadcast.create",
    actorUserId: ctx.userId,
    accountId: ctx.accountId,
    resourceType: "broadcast",
    resourceId: broadcast.id,
    meta: { name, templateName },
  });

  return NextResponse.json({ broadcast }, { status: 201 });
}
