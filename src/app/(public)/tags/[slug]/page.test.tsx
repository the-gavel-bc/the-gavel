vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  resolve: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error("NEXT_REDIRECT " + href);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock(
  "@/backend/public-articles/public-tag-archive/public-tag-archive",
  () => ({ getPublicTagArchiveForRequest: mocks.read }),
);
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@/backend/taxonomy/taxonomy-redirect/taxonomy-redirect", () => ({
  resolveTaxonomyRedirect: mocks.resolve,
}));
import Page, { generateMetadata } from "./page";
const props = {
  params: Promise.resolve({ slug: "campus-life" }),
  searchParams: Promise.resolve({ cursor: "token" }),
};
const archive = {
  title: "Campus life",
  section: null,
  category: null,
  href: "/tags/campus-life",
  isLetters: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue(null);
  mocks.read.mockResolvedValue({
    kind: "ok",
    archive,
    items: [],
    nextCursor: null,
    continuation: false,
  });
});
it("passes slug and opaque cursor through the request-cached boundary", async () => {
  render(await Page(props));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Campus life",
  );
  expect(mocks.read).toHaveBeenCalledWith("campus-life", "token");
  expect(await generateMetadata(props)).toMatchObject({ title: "Campus life" });
});
it("resolves real notFound before rendering either page or metadata", async () => {
  mocks.read.mockResolvedValue({ kind: "notFound" });
  await expect(Page(props)).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(generateMetadata(props)).rejects.toThrow("NEXT_NOT_FOUND");
});
it("does not index invalid cursor or unavailable service states", async () => {
  mocks.read.mockResolvedValue({ kind: "invalid", archive });
  expect(await generateMetadata(props)).toMatchObject({
    robots: { index: false, follow: false },
  });
  mocks.read.mockResolvedValue({ kind: "unavailable" });
  expect(await generateMetadata(props)).toMatchObject({
    robots: { index: false, follow: false },
  });
  render(await Page(props));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Archive temporarily unavailable",
  );
});

it("redirects a retired tag and drops its scope-specific cursor", async () => {
  mocks.read.mockResolvedValue({ kind: "notFound" });
  mocks.resolve.mockResolvedValue("/tags/current");
  await expect(Page(props)).rejects.toThrow("NEXT_REDIRECT /tags/current");
  await expect(generateMetadata(props)).rejects.toThrow(
    "NEXT_REDIRECT /tags/current",
  );
  expect(mocks.resolve).toHaveBeenCalledWith("/tags/campus-life");
  expect(mocks.notFound).not.toHaveBeenCalled();
});
