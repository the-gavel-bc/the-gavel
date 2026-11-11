import { expect, it } from "vitest";
import { isLettersSection, sectionHref } from "./section-link";
it.each([
  ["Letter to the Editor", "configured-letters", "/letters"],
  ["LETTER TO THE EDITOR", "letters-alias", "/letters"],
  ["Letters to the Editor", "plural", "/sections/plural"],
  ["Letter to the Editor ", "trailing", "/sections/trailing"],
  ["News", "news", "/sections/news"],
  ["News", "reserved /?#", "/sections/reserved%20%2F%3F%23"],
])("resolves %s through the existing label rule", (name, slug, href) => {
  expect(sectionHref({ name, slug })).toBe(href);
  expect(isLettersSection({ name })).toBe(href === "/letters");
});
