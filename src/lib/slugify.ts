/**
 * Coerce an arbitrary string into a stable identifier.
 * Lowercases, collapses non-alphanumerics into single underscores,
 * and trims leading/trailing underscores. Falls back to `fallback`
 * for inputs that reduce to an empty string.
 */
export function slugify(s: string, fallback: string): string {
  const cleaned = s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}
