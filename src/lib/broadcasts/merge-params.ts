/**
 * Resolve campaign body params with per-contact merge tokens.
 * Supports {{contact.name}} and {{contact.phone}} (case-insensitive).
 */

export function resolveBodyParamsForContact(
  params: string[],
  contact: { name?: string | null; phone?: string | null },
): string[] {
  const name = (contact.name ?? "").trim();
  const phone = (contact.phone ?? "").trim();
  return params.map((p) =>
    p
      .replace(/\{\{\s*contact\.name\s*\}\}/gi, name)
      .replace(/\{\{\s*contact\.phone\s*\}\}/gi, phone),
  );
}
