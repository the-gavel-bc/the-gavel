import buttonStyles from "@/frontend/components/ui/button/button.module.css";
import { render, screen } from "@testing-library/react";
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
import { AdminArticleList } from "./admin-article-list";

const empty = { items: [], nextCursor: null };

it("uses the shared button style for the dashboard filter", () => {
  render(<AdminArticleList status="all" search="" page={empty} />);
  expect(screen.getByRole("button", { name: "Apply filters" })).toHaveClass(
    buttonStyles.button,
  );
});

it("has no Manage button on rows", () => {
  render(
    <AdminArticleList
      status="all"
      search=""
      page={{
        nextCursor: null,
        items: [
          {
            id: "00000000-0000-0000-0000-000000000002",
            title: "Budget vote",
            slug: "budget-vote",
            status: "published",
            version: 1,
            updatedAt: "2026-11-05T12:00:00+00:00",
            publishedAt: "2026-11-05T12:00:00+00:00",
            archivedAt: null,
            ownerName: "Owner",
            sectionName: "News",
          },
        ],
      }}
    />,
  );
  expect(
    screen.queryByRole("link", { name: /Manage/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Edit article: Budget vote/ }),
  ).toBeVisible();
});

it("opens the archives from the current view and goes back to it", () => {
  const { rerender } = render(
    <AdminArticleList status="published" search="vote" page={empty} />,
  );
  expect(screen.getByRole("link", { name: "View archives" })).toHaveAttribute(
    "href",
    "/dashboard/admin/articles?status=archived&from=published&search=vote",
  );
  rerender(
    <AdminArticleList
      status="archived"
      search="vote"
      from="published"
      page={empty}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Back to published" }),
  ).toHaveAttribute(
    "href",
    "/dashboard/admin/articles?status=published&search=vote",
  );
  rerender(<AdminArticleList status="archived" search="" page={empty} />);
  expect(
    screen.getByRole("link", { name: "Back to all articles" }),
  ).toHaveAttribute("href", "/dashboard/admin/articles");
});
