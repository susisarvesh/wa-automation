import type { SupabaseClient } from "@supabase/supabase-js";

export type BroadcastAudienceFilter =
  | { mode: "all" }
  | {
      mode: "tags";
      tag_ids: string[];
      /** OR (default) vs AND — contact must have every include tag. */
      tag_match?: "any" | "all";
      exclude_tag_ids?: string[];
    }
  | {
      /** One-shot contact list (retry-failed). */
      mode: "contacts";
      contact_ids: string[];
    };

function uniqueStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter((t): t is string => typeof t === "string" && !!t.trim()),
    ),
  ];
}

/**
 * Parse audience_filter from API / DB.
 * Legacy `{ tag_ids }` → tags mode (any).
 */
export function parseAudienceFilter(
  raw: unknown,
): BroadcastAudienceFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (obj.mode === "all") {
    return { mode: "all" };
  }

  if (obj.mode === "contacts") {
    const contactIds = uniqueStrings(obj.contact_ids);
    if (contactIds.length === 0) return null;
    return { mode: "contacts", contact_ids: contactIds };
  }

  // Explicit tags mode, or legacy { tag_ids } without mode.
  const tagIds = uniqueStrings(obj.tag_ids);
  const isTagsMode = obj.mode === "tags" || (obj.mode === undefined && tagIds.length > 0);
  if (!isTagsMode) return null;
  if (tagIds.length === 0) return null;

  const tagMatch =
    obj.tag_match === "all" || obj.tag_match === "any"
      ? obj.tag_match
      : "any";
  const exclude = uniqueStrings(obj.exclude_tag_ids);

  return {
    mode: "tags",
    tag_ids: tagIds,
    tag_match: tagMatch,
    ...(exclude.length ? { exclude_tag_ids: exclude } : {}),
  };
}

async function pageContactIdsByTags(
  admin: SupabaseClient,
  accountId: string,
  tagIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (tagIds.length === 0) return ids;

  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data: rows, error } = await admin
      .from("contact_tags")
      .select("contact_id, contacts!inner(id, account_id)")
      .in("tag_id", tagIds)
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
  return ids;
}

async function resolveAllContactIds(
  admin: SupabaseClient,
  accountId: string,
): Promise<string[]> {
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

async function resolveTaggedContactIds(
  admin: SupabaseClient,
  accountId: string,
  filter: Extract<BroadcastAudienceFilter, { mode: "tags" }>,
): Promise<string[]> {
  const { data: tags, error: tagErr } = await admin
    .from("tags")
    .select("id")
    .eq("account_id", accountId)
    .in("id", filter.tag_ids);

  if (tagErr) throw new Error(tagErr.message);
  const validTagIds = (tags ?? []).map((t) => t.id as string);
  if (validTagIds.length === 0) return [];

  const match = filter.tag_match ?? "any";
  let included: Set<string>;

  if (match === "all") {
    // Intersect contacts that have every include tag.
    let intersection: Set<string> | null = null;
    for (const tagId of validTagIds) {
      const forTag = await pageContactIdsByTags(admin, accountId, [tagId]);
      if (intersection === null) {
        intersection = forTag;
      } else {
        for (const id of [...intersection]) {
          if (!forTag.has(id)) intersection.delete(id);
        }
      }
      if (intersection.size === 0) break;
    }
    included = intersection ?? new Set();
  } else {
    included = await pageContactIdsByTags(admin, accountId, validTagIds);
  }

  if (filter.exclude_tag_ids?.length) {
    const { data: exTags } = await admin
      .from("tags")
      .select("id")
      .eq("account_id", accountId)
      .in("id", filter.exclude_tag_ids);
    const validExclude = (exTags ?? []).map((t) => t.id as string);
    if (validExclude.length) {
      const excluded = await pageContactIdsByTags(
        admin,
        accountId,
        validExclude,
      );
      for (const id of excluded) included.delete(id);
    }
  }

  return [...included];
}

/**
 * Resolve distinct contact IDs for an audience filter.
 * Does not filter by phone validity — use filterSendableContactIds for that.
 */
export async function resolveAudienceContactIds(
  admin: SupabaseClient,
  accountId: string,
  filter: BroadcastAudienceFilter,
): Promise<string[]> {
  if (filter.mode === "all") {
    return resolveAllContactIds(admin, accountId);
  }
  if (filter.mode === "contacts") {
    const { data, error } = await admin
      .from("contacts")
      .select("id")
      .eq("account_id", accountId)
      .in("id", filter.contact_ids);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.id as string);
  }
  return resolveTaggedContactIds(admin, accountId, filter);
}
