import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  parseAudienceFilter,
  resolveAudienceContactIds,
} from "@/lib/broadcasts/audience";
import { filterSendableContactIds } from "@/lib/broadcasts/prepare";

/**
 * POST /api/broadcasts/preview
 * Body: { audience_filter }
 * Returns sendable recipient count (valid phones only).
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireGranted("agent");
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filter = parseAudienceFilter(body.audience_filter);
  if (!filter) {
    return NextResponse.json(
      { error: "Invalid audience_filter" },
      { status: 400 },
    );
  }

  try {
    const admin = supabaseAdmin();
    const resolved = await resolveAudienceContactIds(
      admin,
      ctx.accountId,
      filter,
    );
    const sendable = await filterSendableContactIds(
      admin,
      ctx.accountId,
      resolved,
    );
    return NextResponse.json({
      count: sendable.length,
      resolved: resolved.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
