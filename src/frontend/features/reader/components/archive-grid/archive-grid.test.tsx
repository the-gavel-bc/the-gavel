import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ArchiveGrid } from "./archive-grid";
import type { PublicArchiveResult } from "@/backend/public-articles/public-archive/public-archive";
const section = {
  name: "News",
  slug: "news",
  categories: [{ name: "Campus", slug: "campus" }],
};
const archive = {
  title: "News",
  section,
  category: null,
  href: "/sections/news",
  isLetters: false,
};
const card = (n: number) => ({
  id: `53000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  title: `Story ${n}`,
  slug: `story-${n}`,
  excerpt: null,
  publishedAt: "2026-11-09T00:00:00Z",
  section,
  owner: { displayName: "Writer", slug: "writer" },
  writers: [],
  mainImage: null,
});
const result: Extract<PublicArchiveResult, { kind: "ok" }> = {
  kind: "ok",
  archive,
  items: [card(1), card(2)],
  nextCursor: "opaque_token",
  continuation: false,
};
it("promotes the first section story without duplicating it and preserves native cursor links", () => {
  render(<ArchiveGrid result={result} />);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("News");
  expect(screen.getAllByRole("link", { name: "Story 1" })).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Story 1" }).tagName).toBe("H2");
  expect(screen.getByRole("link", { name: "Older articles" })).toHaveAttribute(
    "href",
    "/sections/news?cursor=opaque_token",
  );
  expect(screen.getByRole("link", { name: "Campus" })).toHaveAttribute(
    "href",
    "/sections/news/categories/campus",
  );
  expect(
    screen.queryByRole("link", { name: "Newest articles" }),
  ).not.toBeInTheDocument();
});
it("keeps category breadcrumbs and chips scoped to the parent section", () => {
  render(
    <ArchiveGrid
      result={{
        ...result,
        archive: {
          ...archive,
          title: "Campus",
          category: section.categories[0],
          href: "/sections/news/categories/campus",
        },
      }}
    />,
  );
  const crumbs = screen.getByRole("navigation", { name: "Breadcrumbs" });
  expect(within(crumbs).getByRole("link", { name: "News" })).toHaveAttribute(
    "href",
    "/sections/news",
  );
  expect(
    screen
      .getByRole("navigation", { name: "Categories" })
      .querySelector('[aria-current="page"]'),
  ).toHaveTextContent("Campus");
  expect(screen.getByRole("link", { name: "Older articles" })).toHaveAttribute(
    "href",
    "/sections/news/categories/campus?cursor=opaque_token",
  );
});
it("distinguishes empty archives, final continuation pages, invalid cursors and service failure", () => {
  const { rerender } = render(
    <ArchiveGrid result={{ ...result, items: [], nextCursor: null }} />,
  );
  expect(screen.getByText("No articles yet")).toBeVisible();
  expect(
    screen.queryByRole("navigation", { name: "Article pages" }),
  ).not.toBeInTheDocument();
  rerender(
    <ArchiveGrid
      result={{ ...result, items: [], nextCursor: null, continuation: true }}
    />,
  );
  expect(screen.getByText("No more articles")).toBeVisible();
  expect(screen.getByRole("link", { name: "Newest articles" })).toHaveAttribute(
    "href",
    "/sections/news",
  );
  rerender(<ArchiveGrid result={{ kind: "invalid", archive }} />);
  expect(
    screen.getByText("This article page is invalid or expired."),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Newest articles" })).toHaveAttribute(
    "href",
    "/sections/news",
  );
  rerender(<ArchiveGrid result={{ kind: "unavailable" }} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Archive temporarily unavailable",
  );
});
it("links letters submission guidance and keeps continuation pages as a grid", () => {
  render(
    <ArchiveGrid
      result={{
        ...result,
        continuation: true,
        archive: { ...archive, href: "/letters", isLetters: true },
      }}
    />,
  );
  expect(
    screen.getByRole("link", { name: "How to submit a letter" }),
  ).toHaveAttribute("href", "/letters/how-to-submit");
  expect(screen.getByRole("heading", { name: "Story 1" }).tagName).toBe("H2");
  expect(screen.getByRole("link", { name: "Newest articles" })).toHaveAttribute(
    "href",
    "/letters",
  );
});

it("renders sectionless tag archives as a grid without section-only controls", () => {
  render(
    <ArchiveGrid
      result={{
        ...result,
        archive: {
          title: "Campus life",
          section: null,
          category: null,
          isLetters: false,
          href: "/tags/campus-life",
        },
      }}
    />,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Campus life",
  );
  expect(
    screen.queryByRole("navigation", { name: "Categories" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "How to submit a letter" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.getAllByText("No image")).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "News" })[0]).toHaveAttribute(
    "href",
    "/sections/news",
  );
  expect(screen.getByRole("link", { name: "Older articles" })).toHaveAttribute(
    "href",
    "/tags/campus-life?cursor=opaque_token",
  );
});
