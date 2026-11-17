import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock(
  "@/backend/articles/article-lifecycle/article-lifecycle-actions",
  () => ({ archiveArticleAction: vi.fn(), restoreArticleAction: vi.fn() }),
);
vi.mock("@/backend/articles/article-deletion/article-deletion-actions", () => ({
  deleteArticleAction: vi.fn(),
}));
import { ArticleFilters, ArticleList } from "./article-list";
import type { ArticlePage } from "@/backend/articles/draft-queries/draft-queries";
const row = {
  id: "00000000-0000-0000-0000-000000000002",
  title: "Campus news",
  slug: "campus-news",
  status: "draft",
  sectionId: "00000000-0000-0000-0000-000000000001",
  sectionName: "News",
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
it("renders titles as text and links editable draft and published rows", async () => {
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
    screen.getByRole("link", { name: "Edit article: Published story" }),
  ).toHaveAttribute("href", "/dashboard/articles/published");
  expect(
    screen.queryByRole("link", { name: /Archived story/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Edit draft: Campus news" }),
  ).toHaveAttribute("href", `/dashboard/articles/${row.id}`);
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard?cursor=opaque-cursor",
  );
  await userEvent.tab();
  await userEvent.tab();
  expect(
    screen.getByRole("link", { name: "Edit draft: Campus news" }),
  ).toHaveFocus();
  expect(screen.getAllByText(/ ET$/)).toHaveLength(3);
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
it("offers status and search filters that travel with the next-page link", () => {
  render(
    <>
      <ArticleFilters status="draft" search="campus" />
      <ArticleList
        page={{ items: [row], nextCursor: "opaque-cursor" }}
        status="draft"
        search="campus"
      />
    </>,
  );
  // The filters sit outside the list region, so a row's status stays unique.
  expect(
    screen.getByLabelText("Status").closest('[aria-label="Your articles"]'),
  ).toBeNull();
  expect(screen.getByLabelText("Status")).toHaveValue("draft");
  expect(screen.getByLabelText("Search my article titles")).toHaveValue(
    "campus",
  );
  expect(
    screen.getByRole("button", { name: "Apply filters" }).closest("form"),
  ).toHaveAttribute("action", "/dashboard");
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard?status=draft&search=campus&cursor=opaque-cursor",
  );
  // The section tells same-titled articles apart.
  expect(screen.getByText("News")).toBeVisible();
});
it("says when filters, not an empty desk, are why nothing is listed", () => {
  render(
    <ArticleList page={{ items: [], nextCursor: null }} status="archived" />,
  );
  expect(screen.getByText("No articles match these filters.")).toBeVisible();
});
