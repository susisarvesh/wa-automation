import { NextResponse } from "next/server";
import {
  requireGranted,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { isValidE164, sanitizePhoneForMeta } from "@/lib/whatsapp/phone-utils";

function normalizeEmployeePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = sanitizePhoneForMeta(trimmed);
  const e164 = trimmed.startsWith("+") ? `+${digits}` : `+${digits}`;
  if (!isValidE164(e164)) return null;
  return e164;
}

export async function GET() {
  try {
    const ctx = await requireRole("viewer");
    const { data, error } = await ctx.supabase
      .from("employees")
      .select("*")
      .eq("account_id", ctx.accountId)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ employees: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireGranted("admin");
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = normalizeEmployeePhone(
    typeof body.phone === "string" ? body.phone : "",
  );
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim().toLowerCase()
      : null;
  const userId =
    typeof body.user_id === "string" && body.user_id ? body.user_id : null;
  const isActive = body.is_active === false ? false : true;

  if (!name || !phone) {
    return NextResponse.json(
      { error: "name and a valid phone (E.164) are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("employees")
    .insert({
      account_id: ctx.accountId,
      name,
      phone,
      email,
      user_id: userId,
      is_active: isActive,
    })
    .select("*")
    .single();

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

  return NextResponse.json({ employee: data }, { status: 201 });
}
