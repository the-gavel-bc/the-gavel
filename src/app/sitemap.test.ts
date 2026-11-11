import { beforeEach, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/backend/reader/public-sitemap/public-sitemap", () => ({
  getPublicSitemap: read,
}));
import sitemap, { dynamic } from "./sitemap";

beforeEach(() => read.mockReset());

it("renders on every request so archive and restore apply immediately", () => {
  expect(dynamic).toBe("force-dynamic");
});

it("returns the checked public entries", async () => {
  const entries = [
    { url: "https://gavel.example/" },
    {
      url: "https://gavel.example/articles/story",
      lastModified: "2026-11-01T12:00:00.123456Z",
    },
  ];
  read.mockResolvedValue({ kind: "ok", entries });
  expect(await sitemap()).toEqual(entries);
});

it("fails with a generic error instead of an empty or partial sitemap", async () => {
  read.mockResolvedValue({ kind: "unavailable" });
  await expect(sitemap()).rejects.toThrow(/^Sitemap unavailable$/);
});
