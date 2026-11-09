import { isDraftUuid } from "../draft-contract/draft-contract";
export { isDraftUuid };
export type DraftCursor = { version: 1; updatedAt: string; id: string };
// Preserve PostgreSQL microseconds: converting through Date would lose ordering precision.
export function isDatabaseTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|\+00:00)$/u.exec(
      value,
    );
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    hour < 24 &&
    minute < 60 &&
    second < 60
  );
}

export function encodeDraftCursor(value: Omit<DraftCursor, "version">): string {
  if (!isDraftUuid(value.id) || !isDatabaseTimestamp(value.updatedAt))
    throw new Error("Invalid draft cursor.");
  return Buffer.from(
    JSON.stringify({ version: 1, updatedAt: value.updatedAt, id: value.id }),
  ).toString("base64url");
}

export function decodeDraftCursor(value: unknown): DraftCursor | null {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  )
    return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) return null;
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const cursor = parsed as Record<string, unknown>;
    if (
      Object.keys(cursor).length !== 3 ||
      cursor.version !== 1 ||
      !isDraftUuid(cursor.id) ||
      !isDatabaseTimestamp(cursor.updatedAt)
    )
      return null;
    return { version: 1, id: cursor.id, updatedAt: cursor.updatedAt };
  } catch {
    return null;
  }
}
