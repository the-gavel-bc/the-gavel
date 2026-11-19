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
  it("previews the title, a small byline and date, and the summary", () => {
    render(
      <ReaderSurface>
        <ArticleCard article={article} />
      </ReaderSurface>,
    );
    expect(screen.getByRole("link", { name: article.title })).toHaveAttribute(
      "href",
      "/articles/campus-story",
    );
    expect(screen.getByText(article.excerpt!)).toBeVisible();
    // Byline and date as small plain text inside the story link; no photo
    // credit and no separate author link.
    expect(screen.getByText("Writer")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Writer" })).toBeNull();
    expect(screen.getByText("Nov 8, 2026")).toHaveAttribute(
      "datetime",
      article.publishedAt,
    );
    expect(screen.queryByText(/^Photo:/)).toBeNull();
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
  it("marks whole search words in the title without parsing HTML", () => {
    render(
      <ReaderSurface>
        <ArticleCard
          article={{ ...article, title: "A campus story <b>campuswide</b>" }}
          highlight="CAMPUS (story"
        />
      </ReaderSurface>,
    );
    const marks = [...document.querySelectorAll("mark")].map(
      (mark) => mark.textContent,
    );
    expect(marks).toEqual(["campus", "story"]);
    expect(screen.getByRole("heading")).toHaveTextContent(
      "A campus story <b>campuswide</b>",
    );
    expect(document.querySelector("h3 b")).toBeNull();
  });
  it("offers a way forward from an empty archive", () => {
    render(
      <ReaderState
        kind="empty"
        action={{ href: "/sections/sports", label: "See all Sports stories" }}
      />,
    );
    expect(
      screen.getByRole("link", { name: /See all Sports stories/ }),
    ).toHaveAttribute("href", "/sections/sports");
  });
});
