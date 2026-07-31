import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/observability/logger";

export type JobType =
  | "webhook.process"
  | "whatsapp.send_retry"
  | "automation.drain"
  | "broadcast.send_batch";

const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000];

export async function enqueueJob(
  admin: SupabaseClient,
  input: {
    jobType: JobType | string;
    payload: Record<string, unknown>;
    accountId?: string | null;
    runAt?: Date;
    maxAttempts?: number;
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from("job_queue")
    .insert({
      job_type: input.jobType,
      payload: input.payload,
      account_id: input.accountId ?? null,
      run_at: (input.runAt ?? new Date()).toISOString(),
      max_attempts: input.maxAttempts ?? 8,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    log.warn("job_queue enqueue failed", { message: error.message });
    return null;
  }
  return (data?.id as string) ?? null;
}

export type JobRow = {
  id: string;
  account_id: string | null;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

/**
 * Claim due jobs (best-effort). Prefer SKIP LOCKED via RPC later.
 */
export async function claimDueJobs(
  admin: SupabaseClient,
  limit = 20,
): Promise<JobRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("job_queue")
    .select("id, account_id, job_type, payload, attempts, max_attempts")
    .eq("status", "pending")
    .lte("run_at", now)
    .order("run_at", { ascending: true })
    .limit(limit);

  if (error || !data?.length) {
    if (error) log.warn("job_queue claim list failed", { message: error.message });
    return [];
  }

  const claimed: JobRow[] = [];
  for (const row of data) {
    const { data: updated, error: updErr } = await admin
      .from("job_queue")
      .update({
        status: "running",
        attempts: (row.attempts as number) + 1,
        updated_at: now,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id, account_id, job_type, payload, attempts, max_attempts")
      .maybeSingle();
    if (!updErr && updated) claimed.push(updated as JobRow);
  }
  return claimed;
}

export async function completeJob(
  admin: SupabaseClient,
  id: string,
): Promise<void> {
  await admin
    .from("job_queue")
    .update({
      status: "done",
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", id);
}

export async function failJob(
  admin: SupabaseClient,
  job: JobRow,
  errorMessage: string,
): Promise<void> {
  const attempts = job.attempts;
  const dead = attempts >= job.max_attempts;
  const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? 1_800_000;
  const runAt = new Date(Date.now() + delay).toISOString();

  await admin
    .from("job_queue")
    .update({
      status: dead ? "dead" : "pending",
      run_at: dead ? new Date().toISOString() : runAt,
      last_error: errorMessage.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (dead) {
    log.error("job_queue dead letter", {
      jobId: job.id,
      jobType: job.job_type,
      error: errorMessage,
    });
  }
}
