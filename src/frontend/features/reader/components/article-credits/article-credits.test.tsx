import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ArticleCredits } from "./article-credits";
import type { PublicArticle } from "@/backend/public-articles/public-article/public-article";

const article = {
  owner: { displayName: "Owner Person", slug: "owner-person" },
  contributors: [
    {
      displayName: "Staff Editor",
      slug: "staff-editor",
      role: "editor",
      displayOrder: 0,
    },
    {
      displayName: "Guest Photographer",
      slug: null,
      role: "creative",
      displayOrder: 0,
    },
  ],
} as unknown as PublicArticle;

it("links people with author pages and shows one-off credits as plain text", () => {
  render(<ArticleCredits article={article} />);
  expect(screen.getByRole("link", { name: "Staff Editor" })).toHaveAttribute(
    "href",
    "/authors/staff-editor",
  );
  expect(screen.getByText("Guest Photographer")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Guest Photographer" }),
  ).not.toBeInTheDocument();
});

it("leaves writers to the header byline", () => {
  render(
    <ArticleCredits
      article={
        {
          contributors: [
            {
              displayName: "Writer",
              slug: null,
              role: "writer",
              displayOrder: 0,
            },
          ],
        } as unknown as PublicArticle
      }
    />,
  );
  expect(screen.queryByText("Writer")).not.toBeInTheDocument();
});
