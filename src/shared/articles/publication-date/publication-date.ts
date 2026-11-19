// The publication date is a calendar date in Eastern time (the site's clock).
// The database is the authority; this mirrors its rules for early feedback.

const EASTERN = "America/New_York";

/** Today's date in Eastern time as YYYY-MM-DD. */
export function easternToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** An error message for the field, or null when the value is fine. */
export function publicationDateError(
  value: unknown,
  today: string = easternToday(),
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isCalendarDate(value)) return "Enter a valid date.";
  if (value > today) return "The date cannot be in the future.";
  return null;
}
