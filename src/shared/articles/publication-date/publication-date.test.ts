import { describe, expect, it } from "vitest";
import {
  easternToday,
  isCalendarDate,
  publicationDateError,
} from "./publication-date";

describe("publication date", () => {
  it("reads today's date in Eastern time, not UTC", () => {
    // 2026-03-01 02:30 UTC is still 2026-02-28 in New York.
    expect(easternToday(new Date("2026-03-01T02:30:00Z"))).toBe("2026-02-28");
    expect(easternToday(new Date("2026-03-01T06:00:00Z"))).toBe("2026-03-01");
  });
  it.each([
    ["2026-01-15", true],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["01/15/2026", false],
    ["2026-1-5", false],
    [20260115, false],
    [null, false],
  ])("recognizes %s as a calendar date: %s", (value, ok) => {
    expect(isCalendarDate(value)).toBe(ok);
  });
  it("accepts blank, today and the past; refuses the future and nonsense", () => {
    const today = "2026-06-10";
    expect(publicationDateError(undefined, today)).toBeNull();
    expect(publicationDateError(null, today)).toBeNull();
    expect(publicationDateError("", today)).toBeNull();
    expect(publicationDateError("2026-06-10", today)).toBeNull();
    expect(publicationDateError("2026-01-01", today)).toBeNull();
    expect(publicationDateError("2026-06-11", today)).toMatch(/future/);
    expect(publicationDateError("2026-02-30", today)).toMatch(/valid/);
  });
});
