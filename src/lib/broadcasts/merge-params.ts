export type MergeContact = {
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  email?: string | null;
  /** Values keyed by custom_fields.field_key */
  custom?: Record<string, string | null | undefined>;
};

const BUILTIN_RE = /\{\{\s*contact\.(name|phone|company|email)\s*\}\}/gi;
const CUSTOM_RE = /\{\{\s*contact\.custom\.([a-z0-9_]+)\s*\}\}/gi;

/**
 * Replace {{contact.name|phone|company|email}} and
 * {{contact.custom.<field_key>}} in a param string.
 * Unknown / missing contact fields become empty string.
 */
export function mergeParamString(
  value: string,
  contact: MergeContact,
): string {
  let out = value.replace(BUILTIN_RE, (_m, field: string) => {
    const key = field.toLowerCase() as keyof Omit<MergeContact, "custom">;
    return String(contact[key] ?? "").trim();
  });
  out = out.replace(CUSTOM_RE, (_m, fieldKey: string) => {
    const v = contact.custom?.[fieldKey];
    return String(v ?? "").trim();
  });
  return out;
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

/**
 * True when a URL-button {{1}} value looks like a destination we should
 * wrap in the Studio /r tracker (absolute http(s) URL).
 */
export function looksLikeTrackedDestination(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Rewrite an absolute destination into a Meta URL-button suffix for
 * templates registered as `{SITE}/r/{{1}}`.
 */
export function buildTrackedUrlButtonParam(input: {
  broadcastId: string;
  recipientId: string;
  destination: string;
}): string {
  const dest = input.destination.trim();
  const q = encodeURIComponent(dest);
  return `${input.broadcastId}/${input.recipientId}?u=${q}`;
}
