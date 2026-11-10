import { expect, it } from "vitest";
import { normalizePublicSearchQuery } from "./public-search";
it("normalizes the explicitly shared whitespace set without changing case or syntax", () => {
  expect(normalizePublicSearchQuery(" \tBoston\u00a0\u2003College\n")).toBe(
    "Boston College",
  );
  expect(normalizePublicSearchQuery("\u0085\ufeffThe Gavel\u3000")).toBe(
    "The Gavel",
  );
  expect(
    normalizePublicSearchQuery('  "May" %_ \';drop table articles;-- '),
  ).toBe('"May" %_ \';drop table articles;--');
});
it("rejects malformed, control, empty and oversized inputs cheaply", () => {
  for (const input of [
    null,
    {},
    "",
    " \n ",
    "word\u0000",
    "word\u007f",
    "\ud800",
    "a".repeat(161),
    " ".repeat(513),
  ])
    expect(normalizePublicSearchQuery(input)).toBeNull();
  expect(normalizePublicSearchQuery("😀".repeat(160))).toBe("😀".repeat(160));
});
