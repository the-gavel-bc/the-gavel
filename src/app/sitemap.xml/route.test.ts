import { beforeEach, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/backend/reader/public-sitemap/public-sitemap", () => ({
  getPublicSitemap: read,
}));
import { GET, dynamic } from "./route";

const noStore = "private, no-cache, no-store, max-age=0, must-revalidate";
beforeEach(() => read.mockReset());

it("renders on every request so archive and restore apply immediately", () => {
  expect(dynamic).toBe("force-dynamic");
});

it("renders escaped sitemap XML without caching", async () => {
  read.mockResolvedValue({
    kind: "ok",
    entries: [
      { url: "https://gavel.example/?a=1&b=<2>" },
      {
        url: "https://gavel.example/articles/story",
        lastModified: "2026-11-01T12:00:00.123456Z",
      },
    ],
  });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe(noStore);
  expect(response.headers.get("Content-Type")).toBe(
    "application/xml; charset=utf-8",
  );
  const body = await response.text();
  expect(body).toContain(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  );
  expect(body).toContain(
    "<loc>https://gavel.example/?a=1&amp;b=&lt;2&gt;</loc>",
  );
  expect(body).toContain(
    "<url><loc>https://gavel.example/articles/story</loc><lastmod>2026-11-01T12:00:00.123456Z</lastmod></url>",
  );
});

it("returns 503 with Retry-After when the shared budget is spent", async () => {
  read.mockResolvedValue({ kind: "rate_limited", retryAfter: 17 });
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("17");
  expect(response.headers.get("Cache-Control")).toBe(noStore);
});

it("returns a generic uncached 503 instead of a partial sitemap", async () => {
  read.mockResolvedValue({ kind: "unavailable" });
  const response = await GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBeNull();
  expect(await response.text()).toBe("Sitemap temporarily unavailable");
});
