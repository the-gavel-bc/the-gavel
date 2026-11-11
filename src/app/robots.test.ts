import { expect, it, vi } from "vitest";
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import robots from "./robots";

// Longest matching prefix wins, as in RFC 9309; ties favor allow.
function allowed(path: string) {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const list = (v: string | string[] | undefined) => [v ?? []].flat();
  const longest = (prefixes: string[]) =>
    Math.max(
      -1,
      ...prefixes.filter((p) => path.startsWith(p)).map((p) => p.length),
    );
  return longest(list(rule.allow)) >= longest(list(rule.disallow));
}

it.each([
  "/",
  "/articles/story",
  "/authors/writer",
  "/sections/news/categories/campus",
  "/tags/housing",
  "/letters",
  "/letters/how-to-submit",
  "/about",
  "/api/public/articles/a/media/b",
])("allows public path %s", (path) => expect(allowed(path)).toBe(true));

it.each([
  "/dashboard",
  "/dashboard/articles",
  "/auth/callback",
  "/sign-in",
  "/access-pending",
  "/search",
  "/search?q=housing",
  "/api/articles/x",
  "/api/internal/media-cleanup",
])("disallows private, auth, API and search path %s", (path) =>
  expect(allowed(path)).toBe(false),
);

it("names the sitemap on the validated site origin", () => {
  expect(robots().sitemap).toBe("https://gavel.example/sitemap.xml");
});

it("renders per request so the sitemap origin is never fixed at build time", async () => {
  expect((await import("./robots")).dynamic).toBe("force-dynamic");
});
