import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/backend/public-homepage/public-homepage", () => ({
  getPublicHomepageForRequest: mocks.read,
}));
import Home, { generateMetadata } from "./page";
const card = {
  id: "58000000-0000-0000-0000-000000000040",
  slug: "lead-story",
  title: "A lead story",
  excerpt: "A plain-text introduction.",
  publishedAt: "2026-11-09T00:00:00.123456Z",
  section: { name: "News", slug: "news" },
  owner: { displayName: "Writer", slug: "writer" },
  writers: [],
  mainImage: null,
};
const empty = {
  kind: "ok",
  lead: null,
  featured: [],
  readThis: [],
  latest: [],
  sections: [],
};
beforeEach(() => vi.resetAllMocks());
it("keeps unavailable homepage responses out of indexing", async () => {
  mocks.read.mockResolvedValue({ kind: "unavailable" });
  expect(await generateMetadata()).toEqual({
    robots: { index: false, follow: false },
  });
});
it("distinguishes no stories from unavailable service", async () => {
  mocks.read
    .mockResolvedValueOnce(empty)
    .mockResolvedValueOnce({ kind: "unavailable" });
  const { unmount } = render(await Home());
  expect(screen.getByText("No articles yet")).toBeVisible();
  unmount();
  render(await Home());
  expect(
    screen.getByText("Articles are temporarily unavailable"),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/",
  );
});
it("renders a single-story hero without fabricated Latest or Featured groups", async () => {
  mocks.read.mockResolvedValue({ ...empty, lead: card });
  render(await Home());
  expect(
    screen.getByRole("heading", { level: 1, name: "The Gavel" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 2, name: card.title }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: card.title })).toHaveAttribute(
    "href",
    "/articles/lead-story",
  );
  expect(
    screen.queryByRole("heading", { name: "Latest" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Featured News" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("renders reserved published stories even when no free lead exists", async () => {
  mocks.read.mockResolvedValue({ ...empty, featured: [card], latest: [card] });
  render(await Home());
  expect(screen.queryByText("No articles yet")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Featured News" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Latest" })).toBeVisible();
});
it("uses eager authorized hero media and renders real partial groups", async () => {
  const other = {
    ...card,
    id: "58000000-0000-0000-0000-000000000041",
    slug: "other-story",
    title: "Another story",
  };
  mocks.read.mockResolvedValue({
    ...empty,
    lead: {
      ...card,
      mainImage: {
        id: "68000000-0000-0000-0000-000000000040",
        width: 800,
        height: 600,
        alt: "Campus scene",
        credit: "Photographer",
      },
    },
    latest: [other],
    featured: [other],
    sections: [
      { name: "News", slug: "news", articles: [other] },
      { name: "Empty section", slug: "empty", articles: [] },
    ],
  });
  render(await Home());
  expect(screen.getByRole("img", { name: "Campus scene" })).toHaveAttribute(
    "loading",
    "eager",
  );
  expect(screen.getByRole("img")).toHaveAttribute("fetchpriority", "high");
  expect(screen.getByText("Photo: Photographer")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Latest" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Featured News" })).toBeVisible();
  expect(screen.getByRole("link", { name: "View all News" })).toHaveAttribute(
    "href",
    "/sections/news",
  );
  expect(
    screen.queryByRole("heading", { name: "Empty section" }),
  ).not.toBeInTheDocument();
});
