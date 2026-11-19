import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PublicArticle } from "@/backend/public-articles/public-article/public-article";
import { ArticleCard } from "./article-card";
import { ArchiveLead } from "../archive-grid/archive-lead";
import { HomeSection } from "../home-section/home-section";
import { ArticleHeader } from "../article-header/article-header";
import { ArchiveHeader } from "../archive-header/archive-header";
import { CategoryChips } from "../category-chips/category-chips";
import { ReaderNavigation } from "@/frontend/components/site/reader-navigation/reader-navigation";
import { SiteFooter } from "@/frontend/components/site/site-footer/site-footer";
vi.mock("next/navigation", () => ({
  usePathname: () => "/sections/configured-letters/categories/campus",
}));
const section = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Letter to the Editor",
  slug: "configured-letters",
  categories: [{ name: "Campus", slug: "campus" }],
};
const card = {
  id: section.id,
  title: "A letter",
  slug: "a-letter",
  excerpt: null,
  publishedAt: "2026-11-11T00:00:00Z",
  section,
  owner: { displayName: "Writer", slug: "writer" },
  writers: [],
  mainImage: null,
};
const article: PublicArticle = {
  ...card,
  metaDescription: null,
  owner: { ...card.owner, biography: null },
  categories: [],
  tags: [],
  contributors: [],
  bodyImages: [],
  content: {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Letter" }] },
      ],
    },
  },
};
const archive = {
  title: "Campus",
  section,
  category: section.categories[0],
  isLetters: true,
  href: "/sections/configured-letters/categories/campus",
};
beforeEach(() =>
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
);
it.each([
  ["card", () => <ArticleCard article={card} />],
  ["archive lead", () => <ArchiveLead article={card} />],
  ["article header", () => <ArticleHeader article={article} />],
  ["archive breadcrumb", () => <ArchiveHeader archive={archive} />],
  ["footer", () => <SiteFooter sections={[section]} />],
  ["navigation", () => <ReaderNavigation sections={[section]} />],
] as const)("uses canonical letters links in %s", (_, element) => {
  render(element());
  expect(screen.getByRole("link", { name: section.name })).toHaveAttribute(
    "href",
    "/letters",
  );
});
it("uses the canonical view-all link without changing article identity", () => {
  render(<HomeSection section={{ ...section, articles: [card] }} />);
  expect(
    screen.getByRole("link", { name: "View All Letter to the Editor" }),
  ).toHaveAttribute("href", "/letters");
  expect(screen.getByRole("link", { name: card.title })).toHaveAttribute(
    "href",
    "/articles/a-letter",
  );
});
it("preserves category scope while category chips link all-stories to letters", () => {
  render(<CategoryChips archive={archive} />);
  expect(screen.getByRole("link", { name: "All stories" })).toHaveAttribute(
    "href",
    "/letters",
  );
  expect(screen.getByRole("link", { name: "Campus" })).toHaveAttribute(
    "href",
    archive.href,
  );
});
it("keeps letters navigation categories under the section path", () => {
  render(<ReaderNavigation sections={[section]} />);
  const campus = screen.getByRole("link", { name: "Campus", hidden: true });
  expect(campus).toHaveAttribute("href", archive.href);
  expect(campus).toHaveAttribute("aria-current", "page");
  expect(
    within(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).getByRole("link", { name: section.name }),
  ).toHaveAttribute("data-active", "true");
});
it.each([
  ["2026-11-10T02:30:00.123456Z", "November 9, 2026"],
  ["2026-01-15T17:00:00Z", "January 15, 2026"],
])(
  "shows the Eastern publication day for %s and retains its timestamp",
  (publishedAt, label) => {
    render(<ArticleHeader article={{ ...article, publishedAt }} />);
    expect(screen.getByText(label)).toHaveAttribute("datetime", publishedAt);
  },
);
it("puts a linked byline beside the date: writers first, else the owner", () => {
  const view = render(<ArticleHeader article={article} />);
  expect(
    screen.getByRole("link", { name: article.owner.displayName }),
  ).toHaveAttribute("href", `/authors/${article.owner.slug}`);
  view.rerender(
    <ArticleHeader
      article={{
        ...article,
        contributors: [
          {
            displayName: "Second",
            slug: "second",
            role: "writer",
            displayOrder: 2,
          },
          {
            displayName: "Editor",
            slug: "editor",
            role: "editor",
            displayOrder: 1,
          },
          {
            displayName: "First",
            slug: "first",
            role: "writer",
            displayOrder: 1,
          },
        ] as typeof article.contributors,
      }}
    />,
  );
  const byline = screen.getByText(/^By/);
  expect(byline).toHaveTextContent("By First, Second");
  expect(screen.getByRole("link", { name: "First" })).toHaveAttribute(
    "href",
    "/authors/first",
  );
  expect(screen.getByRole("link", { name: "Second" })).toHaveAttribute(
    "href",
    "/authors/second",
  );
});
