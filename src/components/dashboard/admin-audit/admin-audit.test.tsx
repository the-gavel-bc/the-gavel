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
            resourceId: "00000000-0000-0000-0000-000000000002",
            createdAt: "2026-11-05T12:00:00+00:00",
          },
        ],
        nextCursor: "safe-cursor",
      }}
    />,
  );
  expect(
    within(screen.getByRole("listitem")).getByText("Archived article"),
  ).toBeVisible();
  expect(screen.getByText("By Editor")).toBeVisible();
  expect(screen.getByText(/Nov 5, 2026/)).toHaveAttribute(
    "datetime",
    "2026-11-05T12:00:00+00:00",
  );
  expect(screen.getByRole("link", { name: /View article/ })).toHaveAttribute(
    "href",
    "/dashboard/admin/articles/00000000-0000-0000-0000-000000000002",
  );
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard/admin/audit?cursor=safe-cursor&action=article.archived",
  );
});
