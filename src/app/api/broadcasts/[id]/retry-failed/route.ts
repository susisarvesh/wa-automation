import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { writeAuditLog } from "@/lib/audit/log";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/broadcasts/[id]/retry-failed
 * Clone a finished campaign into a new draft targeting only failed contacts.
 */
export async function POST(_request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("agent");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: source, error } = await admin
    .from("broadcasts")
    .select("*")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (source.status !== "sent" && source.status !== "failed") {
    return NextResponse.json(
      { error: "Only sent or failed campaigns can retry failed recipients" },
      { status: 400 },
    );
  }

  const failedIds: string[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data: rows, error: rErr } = await admin
      .from("broadcast_recipients")
      .select("contact_id")
      .eq("broadcast_id", id)
      .eq("status", "failed")
      .not("contact_id", "is", null)
      .range(from, from + pageSize - 1);
    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }
    if (!rows?.length) break;
    for (const row of rows) {
      if (row.contact_id) failedIds.push(row.contact_id as string);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const unique = [...new Set(failedIds)];
  if (unique.length === 0) {
    return NextResponse.json(
      { error: "No failed recipients to retry" },
      { status: 400 },
    );
  }

  const { data: broadcast, error: insErr } = await admin
    .from("broadcasts")
    .insert({
      user_id: ctx.userId,
      account_id: ctx.accountId,
      name: `${source.name} (retry failed)`.slice(0, 200),
      template_name: source.template_name,
      template_language: source.template_language,
      template_variables: source.template_variables ?? { body: [] },
      audience_filter: { mode: "contacts", contact_ids: unique },
      scheduled_at: null,
      status: "draft",
    })
    .select("*")
    .single();

  if (insErr || !broadcast) {
    return NextResponse.json(
      { error: insErr?.message ?? "create failed" },
      { status: 500 },
    );
  }

  await writeAuditLog(admin, {
    action: "broadcast.retry_failed",
    actorUserId: ctx.userId,
    accountId: ctx.accountId,
    resourceType: "broadcast",
    resourceId: broadcast.id,
    meta: { sourceId: id, failedCount: unique.length },
  });

  return NextResponse.json({ broadcast }, { status: 201 });
}