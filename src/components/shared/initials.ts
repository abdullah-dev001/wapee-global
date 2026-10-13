/**
 * First letter of the first and last name (e.g. "Jane Doe" -> "JD", "Jane" -> "J").
 * Falls back to the first letter of the email when there is no name, then "?".
 * Pure and locale-agnostic: a non-Latin name's own first characters are used as-is.
 */
export function initialsOf(name: string, email?: string | null): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    const emailFirst = (email ?? '').trim()[0];
    return emailFirst ? emailFirst.toUpperCase() : '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
