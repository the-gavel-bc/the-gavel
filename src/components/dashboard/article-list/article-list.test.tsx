import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { ArticleList } from "./article-list";
import type { ArticlePage } from "@/lib/articles/draft-queries/draft-queries";
const row = {
  id: "00000000-0000-0000-0000-000000000002",
  title: "Campus news",
  slug: "campus-news",
  status: "draft",
  sectionId: "00000000-0000-0000-0000-000000000001",
  version: 1,
  updatedAt: "2026-10-22T12:00:00.123456Z",
} as const;
it("shows an explicit empty state with a keyboard-accessible create link", async () => {
  render(<ArticleList page={{ items: [], nextCursor: null }} />);
  expect(screen.getByText("No articles on this page.")).toBeVisible();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
  await userEvent.tab();
  expect(screen.getByRole("link", { name: "Create draft" })).toHaveFocus();
  expect(screen.getByRole("link", { name: "Create draft" })).toHaveAttribute(
    "href",
    "/dashboard/articles/new",
  );
});
it("renders titles as text and exposes edit only for draft rows", async () => {
  const page: ArticlePage = {
    items: [
      row,
      {
        ...row,
        id: "published",
        title: "Published story",
        status: "published",
      },
      { ...row, id: "archived", title: "Archived story", status: "archived" },
    ],
    nextCursor: "opaque-cursor",
  };
  render(<ArticleList page={page} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText("Published")).toBeVisible();
  expect(screen.getByText("Archived")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: /Published story|Archived story/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Edit Campus news" }),
  ).toHaveAttribute("href", `/dashboard/articles/${row.id}`);
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard?cursor=opaque-cursor",
  );
  await userEvent.tab();
  await userEvent.tab();
  expect(screen.getByRole("link", { name: "Edit Campus news" })).toHaveFocus();
  expect(screen.getAllByText(/UTC/)).toHaveLength(3);
});
it("does not offer a next page without a cursor or interpret title markup", () => {
  const { container } = render(
    <ArticleList
      page={{
        items: [{ ...row, title: "<script>unsafe</script>" }],
        nextCursor: null,
      }}
    />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(
    screen.getByRole("heading", { name: "<script>unsafe</script>" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Next page" }),
  ).not.toBeInTheDocument();
});
