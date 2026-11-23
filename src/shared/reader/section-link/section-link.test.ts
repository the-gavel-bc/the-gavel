import { expect, it } from "vitest";
import { isLettersSection, sectionHref } from "./section-link";
it.each([
  ["Letters desk", "letter-to-the-editor", "/letters"],
  ["Letter to the Editor", "letters-alias", "/sections/letters-alias"],
  ["Letters to the Editor", "plural", "/sections/plural"],
  ["Letter to the Editor ", "trailing", "/sections/trailing"],
  ["News", "news", "/sections/news"],
  ["News", "reserved /?#", "/sections/reserved%20%2F%3F%23"],
])("resolves %s using the stable section slug", (name, slug, href) => {
  expect(sectionHref({ name, slug })).toBe(href);
  expect(isLettersSection({ slug })).toBe(href === "/letters");
});
