import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeByPhone,
  isUniqueViolation,
  normalizeKey,
} from "@/lib/contacts/dedupe";
import type { ParsedContactRow } from "@/lib/contacts/parse-contact-csv";
import {
  assignImportedContactTags,
  resolveImportTagIds,
  type ContactTagAssignment,
} from "@/lib/contacts/resolve-import-tags";

/**
 * Upsert CSV rows for a campaign audience: match existing phones or insert
 * new contacts, then return contact ids (including ones that already existed).
 */
export async function resolveContactIdsFromCsvRows(
  supabase: SupabaseClient,
  input: {
    accountId: string;
    userId: string;
    rows: ParsedContactRow[];
    canCreateTags: boolean;
  },
): Promise<{
  contactIds: string[];
  created: number;
  matched: number;
  failed: number;
}> {
  const { unique } = dedupeByPhone(input.rows);
  if (unique.length === 0) {
    return { contactIds: [], created: 0, matched: 0, failed: 0 };
  }

  const keys = unique.map((r) => normalizeKey(r.phone)).filter(Boolean);

  const { data: existingRows } = await supabase
    .from("contacts")
    .select("id, phone_normalized")
    .eq("account_id", input.accountId)
    .in("phone_normalized", keys);

  const idByNorm = new Map<string, string>();
  for (const row of existingRows ?? []) {
    const n = (row as { phone_normalized?: string }).phone_normalized;
    const id = (row as { id: string }).id;
    if (n && id) idByNorm.set(n, id);
  }

  const contactIds: string[] = [];
  let created = 0;
  let matched = 0;
  let failed = 0;

  const allTagNames = unique.flatMap((r) => r.tagNames);
  let tagIdByKey = new Map<string, string>();
  if (allTagNames.length > 0) {
    ({ tagIdByKey } = await resolveImportTagIds(supabase, {
      accountId: input.accountId,
      userId: input.userId,
      tagNames: allTagNames,
      canCreateTags: input.canCreateTags,
    }));
  }
  const tagAssignments: ContactTagAssignment[] = [];

  for (const row of unique) {
    const norm = normalizeKey(row.phone);
    if (!norm) {
      failed += 1;
      continue;
    }
    const existingId = idByNorm.get(norm);
    if (existingId) {
      contactIds.push(existingId);
      matched += 1;
      if (row.tagNames.length > 0) {
        tagAssignments.push({
          contactId: existingId,
          tagNames: row.tagNames,
        });
      }
      continue;
    }

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        user_id: input.userId,
        account_id: input.accountId,
        phone: row.phone,
        name: row.name || null,
        email: row.email || null,
        company: row.company || null,
      })
      .select("id, phone_normalized")
      .maybeSingle();

    if (error || !data?.id) {
      if (isUniqueViolation(error)) {
        const again = await supabase
          .from("contacts")
          .select("id")
          .eq("account_id", input.accountId)
          .eq("phone_normalized", norm)
          .maybeSingle();
        if (again.data?.id) {
          contactIds.push(again.data.id as string);
          matched += 1;
          continue;
        }
      }
      failed += 1;
      continue;
    }

    contactIds.push(data.id as string);
    idByNorm.set(norm, data.id as string);
    created += 1;
    if (row.tagNames.length > 0) {
      tagAssignments.push({
        contactId: data.id as string,
        tagNames: row.tagNames,
      });
    }
  }

  if (tagAssignments.length > 0) {
    try {
      await assignImportedContactTags(supabase, tagAssignments, tagIdByKey);
    } catch {
      // Tags are best-effort for campaign CSV.
    }
  }

  return {
    contactIds: [...new Set(contactIds)],
    created,
    matched,
    failed,
  };
}
