import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import { drainJobQueue } from "@/lib/jobs/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lightweight keep-warm + health ping.
 *
 * Hit by:
 *   - Vercel Cron (vercel.json)
 *   - GitHub Actions schedule (every 10m — works on free Hobby)
 *
 * Also drains due automation waits (same secret as /api/automations/cron).
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  let dbOk = false;
  let pendingDue = 0;
  let jobs = { processed: 0, failed: 0 };

  try {
    const admin = supabaseAdmin();
    const { error } = await admin.from("accounts").select("id").limit(1);
    dbOk = !error;

    const { count } = await admin
      .from("automation_pending_executions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString());
    pendingDue = count ?? 0;

    // Soft-trigger the existing drain endpoint so wait-steps keep moving.
    if (pendingDue > 0) {
      const secret =
        process.env.AUTOMATION_CRON_SECRET || process.env.CRON_SECRET || "";
      const origin = new URL(request.url).origin;
      await fetch(`${origin}/api/automations/cron`, {
        headers: { "x-cron-secret": secret },
        cache: "no-store",
      }).catch(() => null);
    }

    // Retry / catch-up for webhook.process jobs (idempotent).
    jobs = await drainJobQueue(admin, 15);
  } catch (err) {
    console.error("[cron/keepalive]", err);
  }

  return NextResponse.json({
    ok: true,
    warm: true,
    db: dbOk,
    pending_due: pendingDue,
    jobs,
    ms: Date.now() - started,
    at: new Date().toISOString(),
  });
}
