import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("whatsapp_config")
    .select("id, is_primary, account_id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.label === "string") {
    updates.label = body.label.trim() || null;
  }

  if (body.is_primary === true && !existing.is_primary) {
    await admin
      .from("whatsapp_config")
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq("account_id", ctx.accountId)
      .eq("is_primary", true);
    updates.is_primary = true;
  }

  const { data, error } = await admin
    .from("whatsapp_config")
    .update(updates)
    .eq("id", id)
    .select(
      "id, phone_number_id, waba_id, status, label, is_primary, registered_at, connected_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ number: data });
}

export async function DELETE(_request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("whatsapp_config")
    .select("id, is_primary")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { count } = await admin
    .from("whatsapp_config")
    .select("id", { count: "exact", head: true })
    .eq("account_id", ctx.accountId);

  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      {
        error:
          "Cannot remove the only WhatsApp number. Use Disconnect on Connect to remove the workspace link.",
      },
      { status: 400 },
    );
  }

  if (existing.is_primary) {
    return NextResponse.json(
      {
        error:
          "Make another number primary before removing this one (Edit → Set primary).",
      },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("whatsapp_config")
    .delete()
    .eq("id", id)
    .eq("account_id", ctx.accountId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
