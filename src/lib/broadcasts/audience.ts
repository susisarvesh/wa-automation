import type { SupabaseClient } from "@supabase/supabase-js";

export type BroadcastAudienceFilter = {
  tag_ids: string[];
};

export function parseAudienceFilter(
  raw: unknown,
): BroadcastAudienceFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const tagIds = (raw as { tag_ids?: unknown }).tag_ids;
  if (!Array.isArray(tagIds)) return null;
  const ids = tagIds.filter((t): t is string => typeof t === "string" && !!t);
  if (ids.length === 0) return null;
  return { tag_ids: [...new Set(ids)] };
}

/**
 * Resolve distinct contact IDs in an account that have ANY of the tags (OR).
 * Pages through contact_tags to avoid PostgREST row caps.
 */
export async function resolveAudienceContactIds(
  admin: SupabaseClient,
  accountId: string,
  filter: BroadcastAudienceFilter,
): Promise<string[]> {
  const { data: tags, error: tagErr } = await admin
    .from("tags")
    .select("id")
    .eq("account_id", accountId)
    .in("id", filter.tag_ids);

  if (tagErr) throw new Error(tagErr.message);
  const validTagIds = (tags ?? []).map((t) => t.id as string);
  if (validTagIds.length === 0) return [];

  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data: rows, error } = await admin
      .from("contact_tags")
      .select("contact_id, contacts!inner(id, account_id)")
      .in("tag_id", validTagIds)
      .eq("contacts.account_id", accountId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!rows?.length) break;

    for (const row of rows) {
      const cid = row.contact_id as string;
      if (cid) ids.add(cid);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return [...ids];
}
