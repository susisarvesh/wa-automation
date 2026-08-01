import { NextResponse } from "next/server";
import { requireGranted, requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { isValidE164, sanitizePhoneForMeta } from "@/lib/whatsapp/phone-utils";

type Params = { params: Promise<{ id: string }> };

function normalizeEmployeePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = sanitizePhoneForMeta(trimmed);
  const e164 = trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
  if (!isValidE164(e164)) return null;
  return e164;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireRole("viewer");
    const { id } = await params;
    const { data, error } = await ctx.supabase
      .from("employees")
      .select("*")
      .eq("account_id", ctx.accountId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ employee: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

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

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body.phone === "string") {
    const phone = normalizeEmployeePhone(body.phone);
    if (!phone) {
      return NextResponse.json(
        { error: "phone must be valid E.164" },
        { status: 400 },
      );
    }
    updates.phone = phone;
  }
  if (body.email === null) {
    updates.email = null;
  } else if (typeof body.email === "string") {
    updates.email = body.email.trim() ? body.email.trim().toLowerCase() : null;
  }
  if (body.user_id === null) {
    updates.user_id = null;
  } else if (typeof body.user_id === "string") {
    updates.user_id = body.user_id || null;
  }
  if (typeof body.is_active === "boolean") {
    updates.is_active = body.is_active;
  }

  const { data, error } = await supabaseAdmin()
    .from("employees")
    .update(updates)
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .select("*")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json(
      {
        error:
          status === 409
            ? "An employee with this phone already exists"
            : error.message,
      },
      { status },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ employee: data });
}

export async function DELETE(_request: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  const { error } = await supabaseAdmin()
    .from("employees")
    .delete()
    .eq("id", id)
    .eq("account_id", ctx.accountId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
