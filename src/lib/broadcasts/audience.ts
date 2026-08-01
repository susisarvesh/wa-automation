import type { SupabaseClient } from "@supabase/supabase-js";

export type BroadcastAudienceFilter =
  | { mode: "all" }
  | { mode: "tags"; tag_ids: string[] };

export function parseAudienceFilter(
  raw: unknown,
): BroadcastAudienceFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { mode?: unknown; tag_ids?: unknown };

  // New shape: mode all | tags
  if (obj.mode === "all") {
    return { mode: "all" };
  }
  if (obj.mode === "tags" || obj.mode === undefined) {
    const tagIds = obj.tag_ids;
    if (!Array.isArray(tagIds)) {
      // Legacy: { tag_ids: [...] } without mode
      if (obj.mode === "tags") return null;
    }
    if (!Array.isArray(tagIds)) return null;
    const ids = tagIds.filter((t): t is string => typeof t === "string" && !!t);
    if (ids.length === 0) return null;
    return { mode: "tags", tag_ids: [...new Set(ids)] };
  }

  return null;
}

/**
 * Resolve distinct contact IDs for a campaign audience.
 * - all: every contact in the account
 * - tags: contacts with ANY of the tags (OR)
 */
export async function resolveAudienceContactIds(
  admin: SupabaseClient,
  accountId: string,
  filter: BroadcastAudienceFilter,
): Promise<string[]> {
  if (filter.mode === "all") {
    const ids: string[] = [];
    const pageSize = 1000;
    let from = 0;
    for (;;) {
      const { data: rows, error } = await admin
        .from("contacts")
        .select("id")
        .eq("account_id", accountId)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!rows?.length) break;
      for (const row of rows) {
        if (row.id) ids.push(row.id as string);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return ids;
  }

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
