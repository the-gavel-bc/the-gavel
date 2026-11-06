import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/memberships/member-command/member-actions", () => ({
  manageMembershipAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
import { AdminMemberList } from "./admin-member-list";

it("renders a bounded directory row and state-bound pagination", () => {
  render(
    <AdminMemberList
      state="pending"
      currentUserId="90000000-0000-0000-0000-000000000004"
      page={{
        items: [
          {
            userId: "90000000-0000-0000-0000-000000000005",
            email: "new@bc.edu",
            displayName: null,
            role: null,
            state: "pending",
            version: null,
            eligible: true,
          },
        ],
        nextCursor: "safe-cursor",
      }}
    />,
  );
  expect(screen.getByRole("heading", { name: "new@bc.edu" })).toBeVisible();
  expect(
    screen.getByLabelText("Public display name for new@bc.edu"),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Approve new@bc.edu" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard/admin/members?cursor=safe-cursor&state=pending",
  );
});
