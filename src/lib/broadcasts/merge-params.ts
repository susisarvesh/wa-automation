export type MergeContact = {
  name?: string | null;
  phone?: string | null;
};

const TOKEN_RE = /\{\{\s*contact\.(name|phone)\s*\}\}/gi;

/**
 * Replace {{contact.name}} / {{contact.phone}} in a param string.
 * Unknown contact fields become empty string.
 */
export function mergeParamString(
  value: string,
  contact: MergeContact,
): string {
  return value.replace(TOKEN_RE, (_m, field: string) => {
    const key = field.toLowerCase();
    if (key === "name") return (contact.name ?? "").trim();
    if (key === "phone") return (contact.phone ?? "").trim();
    return "";
  });
}

export function mergeParamList(
  values: string[] | undefined,
  contact: MergeContact,
): string[] {
  return (values ?? []).map((v) => mergeParamString(String(v ?? ""), contact));
}

export function mergeButtonParams(
  params: Record<number, string> | Record<string, string> | undefined,
  contact: MergeContact,
): Record<number, string> | undefined {
  if (!params || typeof params !== "object") return undefined;
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    out[idx] = mergeParamString(String(v ?? ""), contact);
  }
  return Object.keys(out).length ? out : undefined;
}
