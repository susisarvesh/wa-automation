import { NextResponse } from "next/server";
import { requireGranted, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  parseAudienceFilter,
  resolveAudienceContactIds,
} from "@/lib/broadcasts/audience";

/** Preview how many contacts an audience filter would reach. */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireGranted("agent");
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  const filter = parseAudienceFilter(body?.audience_filter ?? body);
  if (!filter) {
    return NextResponse.json(
      {
        error:
          'audience_filter must be { mode: "all" } or { mode: "tags", tag_ids: [...] }',
      },
      { status: 400 },
    );
  }

  try {
    const ids = await resolveAudienceContactIds(
      supabaseAdmin(),
      ctx.accountId,
      filter,
    );
    return NextResponse.json({ count: ids.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preview failed" },
      { status: 500 },
    );
  }
}
