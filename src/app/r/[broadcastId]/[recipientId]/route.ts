import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function safeDestination(raw: string | null): string | null {
  if (!raw) return null;
  let dest = raw.trim();
  try {
    dest = decodeURIComponent(dest);
  } catch {
    // keep raw
  }
  dest = dest.trim();
  if (!/^https?:\/\//i.test(dest)) return null;
  try {
    const u = new URL(dest);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Tracked redirect for campaign URL buttons.
 * Template URL should be `{SITE}/r/{{1}}`; send writes
 * `{broadcastId}/{recipientId}?u=<encodedDest>` as the {{1}} suffix.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ broadcastId: string; recipientId: string }> },
) {
  const { broadcastId, recipientId } = await ctx.params;
  const dest = safeDestination(req.nextUrl.searchParams.get("u"));

  if (!dest) {
    return NextResponse.json(
      { error: "Missing or invalid destination" },
      { status: 400 },
    );
  }

  if (
    !broadcastId ||
    !recipientId ||
    !/^[0-9a-f-]{36}$/i.test(broadcastId) ||
    !/^[0-9a-f-]{36}$/i.test(recipientId)
  ) {
    return NextResponse.redirect(dest, 302);
  }

  try {
    const now = new Date().toISOString();
    const { data: row } = await admin()
      .from("broadcast_recipients")
      .select("id, clicked_at")
      .eq("id", recipientId)
      .eq("broadcast_id", broadcastId)
      .maybeSingle();

    if (row?.id && !row.clicked_at) {
      await admin()
        .from("broadcast_recipients")
        .update({
          clicked_at: now,
          reply_payload: "url_click",
        })
        .eq("id", row.id)
        .is("clicked_at", null);
    }
  } catch (err) {
    console.error("[r] click log failed:", err);
  }

  return NextResponse.redirect(dest, 302);
}
