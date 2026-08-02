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

export async function GET(request: Request, { params }: Params) {
  try {
    const ctx = await requireRole("viewer");
    const { id } = await params;
    const broadcast = await loadOwned(ctx.accountId, id);
    if (!broadcast) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") || "50") || 50),
    );
    const statusFilter = url.searchParams.get("status")?.trim() || "";
    const exportCsv = url.searchParams.get("export") === "csv";
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin()
      .from("broadcast_recipients")
      .select(
        "id, broadcast_id, contact_id, status, sent_at, delivered_at, read_at, replied_at, error_message, whatsapp_message_id, created_at, contact:contacts(id, name, phone)",
        { count: "exact" },
      )
      .eq("broadcast_id", id)
      .order("created_at", { ascending: true });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    if (exportCsv) {
      query = query.limit(10000);
    } else {
      query = query.range(from, to);
    }

    const { data: recipients, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (exportCsv) {
      const rows = recipients ?? [];
      const header = [
        "status",
        "name",
        "phone",
        "error_message",
        "sent_at",
        "delivered_at",
        "read_at",
        "replied_at",
      ];
      const escape = (v: unknown) => {
        const s = String(v ?? "");
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const lines = [
        header.join(","),
        ...rows.map((r) => {
          const c = r.contact as { name?: string; phone?: string } | null;
          return [
            r.status,
            c?.name ?? "",
            c?.phone ?? "",
            r.error_message ?? "",
            r.sent_at ?? "",
            r.delivered_at ?? "",
            r.read_at ?? "",
            r.replied_at ?? "",
          ]
            .map(escape)
            .join(",");
        }),
      ];
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="campaign-${id}-recipients.csv"`,
        },
      });
    }

    return NextResponse.json({
      broadcast,
      recipients: recipients ?? [],
      recipients_total: count ?? 0,
      page,
      limit,
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
            "audience_filter must be { mode: \"all\" } or { mode: \"tags\", tag_ids: [...] }",
        },
        { status: 400 },
      );
    }
    updates.audience_filter = audience;
  }
  if (body.template_variables && typeof body.template_variables === "object") {
    updates.template_variables = body.template_variables;
  } else if (Array.isArray(body.body_params)) {
    const next: Record<string, unknown> = {
      body: body.body_params.map((p: unknown) => String(p ?? "")),
    };
    if (typeof body.header_text === "string") {
      next.headerText = body.header_text;
    }
    if (body.button_params && typeof body.button_params === "object") {
      next.buttonParams = body.button_params;
    }
    updates.template_variables = next;
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
