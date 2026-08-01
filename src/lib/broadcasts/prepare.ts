import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseAudienceFilter,
  resolveAudienceContactIds,
} from "@/lib/broadcasts/audience";
import { enqueueJob } from "@/lib/jobs/queue";

const INSERT_CHUNK = 400;

/**
 * Resolve audience, insert pending recipients, set total_recipients.
 * Replaces any existing recipients (draft re-send).
 */
export async function materializeRecipients(
  admin: SupabaseClient,
  broadcast: {
    id: string;
    account_id: string;
    audience_filter: unknown;
  },
): Promise<number> {
  const filter = parseAudienceFilter(broadcast.audience_filter);
  if (!filter) {
    throw new Error(
      'Audience must be "all customers" or include at least one tag',
    );
  }

  const contactIds = await resolveAudienceContactIds(
    admin,
    broadcast.account_id,
    filter,
  );

  await admin
    .from("broadcast_recipients")
    .delete()
    .eq("broadcast_id", broadcast.id);

  for (let i = 0; i < contactIds.length; i += INSERT_CHUNK) {
    const chunk = contactIds.slice(i, i + INSERT_CHUNK).map((contact_id) => ({
      broadcast_id: broadcast.id,
      contact_id,
      status: "pending" as const,
    }));
    const { error } = await admin.from("broadcast_recipients").insert(chunk);
    if (error) throw new Error(error.message);
  }

  await admin
    .from("broadcasts")
    .update({
      total_recipients: contactIds.length,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      replied_count: 0,
      failed_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", broadcast.id);

  return contactIds.length;
}

export async function startBroadcastSending(
  admin: SupabaseClient,
  broadcastId: string,
  accountId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("broadcasts")
    .update({
      status: "sending",
      started_at: now,
      completed_at: null,
      updated_at: now,
    })
    .eq("id", broadcastId);

  if (error) throw new Error(error.message);

  await enqueueJob(admin, {
    jobType: "broadcast.send_batch",
    accountId,
    payload: { broadcastId },
  });
}
