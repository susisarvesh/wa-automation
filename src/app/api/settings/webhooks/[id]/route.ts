import { NextResponse } from "next/server";
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

/** DELETE /api/settings/webhooks/[id] */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { accountId } = await requireRole("admin");
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { error } = await supabase
      .from("webhook_endpoints")
      .delete()
      .eq("id", id)
      .eq("account_id", accountId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      return toErrorResponse(err);
    }
    throw err;
  }
}
