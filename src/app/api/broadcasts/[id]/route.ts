import { NextResponse } from "next/server";
import {
  requireGranted,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { writeAuditLog } from "@/lib/audit/log";
import { parseAudienceFilter } from "@/lib/broadcasts/audience";

type Params = { params: Promise<{ id: string }> };

async function loadOwned(
  accountId: string,
  id: string,
) {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("broadcasts")
    .select("*")
    .eq("id", id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireRole("viewer");
    const { id } = await params;
    const broadcast = await loadOwned(ctx.accountId, id);
    if (!broadcast) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: recipients, error } = await supabaseAdmin()
      .from("broadcast_recipients")
      .select(
        "id, broadcast_id, contact_id, status, sent_at, delivered_at, read_at, replied_at, error_message, whatsapp_message_id, created_at, contact:contacts(id, name, phone)",
      )
      .eq("broadcast_id", id)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      broadcast,
      recipients: recipients ?? [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("agent");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const existing = await loadOwned(ctx.accountId, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft campaigns can be edited" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body.template_name === "string" && body.template_name.trim()) {
    updates.template_name = body.template_name.trim();
  }
  if (typeof body.template_language === "string" && body.template_language) {
    updates.template_language = body.template_language;
  }
  if (body.audience_filter !== undefined) {
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
    updates.audience_filter = audience;
  }
  if (Array.isArray(body.body_params)) {
    updates.template_variables = {
      body: body.body_params.map((p: unknown) => String(p ?? "")),
    };
  } else if (body.template_variables && typeof body.template_variables === "object") {
    updates.template_variables = body.template_variables;
  }
  if (body.scheduled_at === null) {
    updates.scheduled_at = null;
  } else if (typeof body.scheduled_at === "string") {
    updates.scheduled_at = body.scheduled_at || null;
  }

  if (updates.template_name || updates.template_language) {
    const name = (updates.template_name as string) ?? existing.template_name;
    const lang =
      (updates.template_language as string) ?? existing.template_language;
    const { data: tmpl } = await supabaseAdmin()
      .from("message_templates")
      .select("id, status")
      .eq("account_id", ctx.accountId)
      .eq("name", name)
      .eq("language", lang)
      .maybeSingle();
    if (!tmpl || String(tmpl.status).toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        { error: "Only APPROVED templates can be used for campaigns" },
        { status: 400 },
      );
    }
  }

  const { data: broadcast, error } = await supabaseAdmin()
    .from("broadcasts")
    .update(updates)
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .select("*")
    .single();

  if (error || !broadcast) {
    return NextResponse.json(
      { error: error?.message ?? "update failed" },
      { status: 500 },
    );
  }

  await writeAuditLog(supabaseAdmin(), {
    action: "broadcast.update",
    actorUserId: ctx.userId,
    accountId: ctx.accountId,
    resourceType: "broadcast",
    resourceId: id,
  });

  return NextResponse.json({ broadcast });
}

export async function DELETE(_request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("agent");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const existing = await loadOwned(ctx.accountId, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft campaigns can be deleted" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin()
    .from("broadcasts")
    .delete()
    .eq("id", id)
    .eq("account_id", ctx.accountId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabaseAdmin(), {
    action: "broadcast.delete",
    actorUserId: ctx.userId,
    accountId: ctx.accountId,
    resourceType: "broadcast",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
