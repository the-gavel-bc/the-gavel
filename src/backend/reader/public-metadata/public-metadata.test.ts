import { expect, it, vi } from "vitest";
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import {
  publicPageMetadata,
  publicArchiveMetadata,
  excludedMetadata,
} from "./public-metadata";
it.each([
  "/",
  "/about",
  "/letters",
  "/letters/how-to-submit",
  "/articles/frozen-story",
  "/authors/frozen-author",
  "/sections/news",
  "/sections/news/categories/campus",
  "/tags/campus",
])("builds trusted canonical and social identity for %s", (path) => {
  const result = publicPageMetadata({
    title: "Public title",
    path,
    description: "A public description",
  });
  expect(result.alternates?.canonical).toBe(`https://gavel.example${path}`);
  expect(result.openGraph).toMatchObject({
    url: `https://gavel.example${path}`,
    title: "Public title | The Gavel",
    siteName: "The Gavel",
  });
});
it.each([
  "//evil.test",
  "https://evil.test/a",
  "/articles/../dashboard",
  "/articles/%2e%2e",
  "/articles/title?draft=1",
  "/articles/title#private",
  "/dashboard",
  "/api/public/articles/a",
  "/sections/a/categories/b/extra",
  "/articles/" + "a".repeat(181),
])("fails closed for malformed/private canonical %s", (path) => {
  const result = publicPageMetadata({ title: "Public title", path });
  expect(result.robots).toMatchObject({ index: false });
  expect(result.alternates?.canonical).toBeNull();
  expect(result.openGraph).toBeNull();
});
it("normalizes bounded Unicode descriptions without interpreting markup", () => {
  const result = publicPageMetadata({
    title: "Title",
    path: "/",
    description: "\u0001Literal <script>text</script>\n\n" + "😀".repeat(400),
  });
  expect(result.description).toMatch(/^Literal <script>text<\/script> /);
  expect(Array.from(result.description!).length).toBe(320);
  expect(publicPageMetadata({ title: "The Gavel", path: "/" }).title).toEqual({
    absolute: "The Gavel",
  });
});
it("excludes invalid/unavailable and continuation variants without stale canonical/social inheritance", () => {
  for (const result of [
    { kind: "unavailable" },
    { kind: "invalid", archive: { title: "News" } },
    { kind: "ok", archive: { title: "News" }, continuation: true },
  ] as const) {
    const metadata = publicArchiveMetadata(
      result as Parameters<typeof publicArchiveMetadata>[0],
    );
    expect(metadata.robots).toMatchObject({ index: false });
    expect(metadata.openGraph).toBeNull();
    expect(metadata.alternates?.canonical).toBeNull();
  }
  expect(excludedMetadata("Search articles").twitter).toBeNull();
});
