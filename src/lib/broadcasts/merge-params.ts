export type MergeContact = {
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  email?: string | null;
};

const TOKEN_RE = /\{\{\s*contact\.(name|phone|company|email)\s*\}\}/gi;

/**
 * Replace {{contact.name|phone|company|email}} in a param string.
 * Unknown / missing contact fields become empty string.
 */
export function mergeParamString(
  value: string,
  contact: MergeContact,
): string {
  return value.replace(TOKEN_RE, (_m, field: string) => {
    const key = field.toLowerCase() as keyof MergeContact;
    return String(contact[key] ?? '').trim();
  });
}

export function mergeParamList(
  values: string[] | undefined,
  contact: MergeContact,
): string[] {
  return (values ?? []).map((v) => mergeParamString(String(v ?? ''), contact));
}

export function mergeButtonParams(
  params: Record<number, string> | Record<string, string> | undefined,
  contact: MergeContact,
): Record<number, string> | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    out[idx] = mergeParamString(String(v ?? ''), contact);
  }
  return Object.keys(out).length ? out : undefined;
}
