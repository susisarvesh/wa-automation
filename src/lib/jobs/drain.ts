import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimDueJobs,
  completeJob,
  failJob,
} from "@/lib/jobs/queue";
import { log } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report-error";

/**
 * Drain due job_queue rows (webhook retries, etc.).
 */
export async function drainJobQueue(
  admin: SupabaseClient,
  limit = 15,
): Promise<{ processed: number; failed: number }> {
  const jobs = await claimDueJobs(admin, limit);
  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      if (job.job_type === "webhook.process") {
        const { processWebhookJobPayload } = await import(
          "@/app/api/whatsapp/webhook/route"
        );
        await processWebhookJobPayload(
          job.payload as Parameters<typeof processWebhookJobPayload>[0],
        );
      } else if (job.job_type === "broadcast.send_batch") {
        const broadcastId = job.payload?.broadcastId;
        if (typeof broadcastId !== "string" || !broadcastId) {
          throw new Error("broadcast.send_batch missing broadcastId");
        }
        const { processBroadcastSendBatch } = await import(
          "@/lib/broadcasts/send"
        );
        await processBroadcastSendBatch(admin, broadcastId);
      } else {
        log.warn("unknown job_type", { jobType: job.job_type, id: job.id });
      }
      await completeJob(admin, job.id);
      processed += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      await failJob(admin, job, msg);
      await reportError(err, { jobId: job.id, jobType: job.job_type });
    }
  }

  return { processed, failed };
}
