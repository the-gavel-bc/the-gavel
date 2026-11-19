import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { AdminAudit } from "./admin-audit";

it("renders safe action, actor, resource and timestamp with filtered pagination", () => {
  render(
    <AdminAudit
      action="article.archived"
      page={{
        items: [
          {
            id: "00000000-0000-0000-0000-000000000001",
            action: "article.archived",
            actorLabel: "Editor",
            articleExists: true,
            articleTitle: "Budget vote",
            resourceId: "00000000-0000-0000-0000-000000000002",
            createdAt: "2026-11-05T12:00:00+00:00",
          },
        ],
        nextCursor: "safe-cursor",
      }}
    />,
  );
  expect(
    within(screen.getByRole("listitem")).getByText("Archived"),
  ).toBeVisible();
  expect(screen.getByText(/Editor ·/)).toBeVisible();
  expect(screen.getByText(/Nov 5, 2026/)).toHaveAttribute(
    "datetime",
    "2026-11-05T12:00:00+00:00",
  );
  expect(screen.getByRole("link", { name: "Budget vote" })).toHaveAttribute(
    "href",
    "/dashboard/admin/articles/00000000-0000-0000-0000-000000000002",
  );
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard/admin/audit?cursor=safe-cursor&action=article.archived",
  );
});

it("does not link prior activity to a deleted article", () => {
  render(
    <AdminAudit
      action={null}
      page={{
        nextCursor: null,
        items: [
          {
            id: "00000000-0000-0000-0000-000000000001",
            action: "article.archived",
            actorLabel: "Editor",
            resourceId: "00000000-0000-0000-0000-000000000002",
            createdAt: "2026-11-05T12:00:00+00:00",
            articleExists: false,
            articleTitle: null,
          },
        ],
      }}
    />,
  );
  expect(
    screen.queryByRole("link", { name: /article/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Deleted article")).toBeVisible();
});

it("marks the current filter pill and links every other action", () => {
  render(
    <AdminAudit
      action="article.archived"
      page={{ items: [], nextCursor: null }}
    />,
  );
  const pills = screen.getByRole("navigation", { name: "Filter activity" });
  expect(within(pills).getByRole("link", { name: "Archived" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(within(pills).getByRole("link", { name: "All" })).toHaveAttribute(
    "href",
    "/dashboard/admin/audit",
  );
  expect(
    within(pills).getByRole("link", { name: "Published" }),
  ).toHaveAttribute("href", "/dashboard/admin/audit?action=article.published");
});
