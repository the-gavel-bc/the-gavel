import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleCard } from "./article-card";
import { ReaderSurface } from "../reader-layout/reader-layout";
import { ArticlePagination } from "../pagination/pagination";
import { ReaderState } from "../reader-states/reader-states";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
const article: PublicArticleCard = {
  id: "57000000-0000-0000-0000-000000000039",
  slug: "campus-story",
  title: "A campus story",
  excerpt: "<strong>Plain text</strong>",
  publishedAt: "2026-11-09T00:00:00.123456Z",
  section: { name: "News", slug: "news" },
  owner: { displayName: "Owner", slug: "owner" },
  writers: [{ displayName: "Writer", slug: "writer" }],
  mainImage: null,
};
describe("reader primitives", () => {
  it("uses canonical links, credited writers and stable UTC dates", () => {
    render(
      <ReaderSurface>
        <ArticleCard article={article} />
      </ReaderSurface>,
    );
    expect(screen.getByRole("link", { name: article.title })).toHaveAttribute(
      "href",
      "/articles/campus-story",
    );
    expect(screen.getByRole("link", { name: "Writer" })).toHaveAttribute(
      "href",
      "/authors/writer",
    );
    expect(
      screen.queryByRole("link", { name: "Owner" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Nov 9, 2026")).toHaveAttribute(
      "datetime",
      article.publishedAt,
    );
    expect(screen.getByText(article.excerpt!)).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("uses the authorized image route and intrinsic dimensions", () => {
    render(
      <ReaderSurface>
        <ArticleCard
          article={{
            ...article,
            mainImage: {
              id: "67000000-0000-0000-0000-000000000039",
              width: 800,
              height: 600,
              alt: "Campus buildings",
              credit: "Photographer",
            },
          }}
        />
      </ReaderSurface>,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/api/public/articles/57000000-0000-0000-0000-000000000039/media/67000000-0000-0000-0000-000000000039",
    );
    expect(screen.getByRole("img")).toHaveAttribute("width", "800");
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  });
  it("renders only available native pagination links", () => {
    render(<ArticlePagination nextHref="/sections/news?cursor=opaque" />);
    expect(
      screen.getByRole("link", { name: /Older articles/ }),
    ).toHaveAttribute("href", "/sections/news?cursor=opaque");
    expect(
      screen.queryByRole("link", { name: /Newer articles/ }),
    ).not.toBeInTheDocument();
  });
  it("distinguishes empty content from failed reads", () => {
    const { rerender } = render(<ReaderState kind="empty" />);
    expect(screen.getByText("No articles yet")).toBeVisible();
    rerender(<ReaderState kind="unavailable" retryHref="/sections/news" />);
    expect(
      screen.getByText("Articles are temporarily unavailable"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      "/sections/news",
    );
  });
});
