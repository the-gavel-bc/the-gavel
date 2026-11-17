import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/backend/memberships/member-command/member-actions", () => ({
  manageMembershipAction: vi.fn(),
}));
vi.mock("@/backend/memberships/invitation-command/invitation-actions", () => ({
  manageInvitationAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
import { AdminMemberList } from "./admin-member-list";

const summary = { administrators: 3, authors: 97, invited: 5, inactive: 2 };
const person = {
  key: "90000000-0000-0000-0000-000000000005",
  userId: null,
  invitationId: "90000000-0000-0000-0000-000000000005",
  email: "new@bc.edu",
  displayName: null,
  role: "author" as const,
  state: "invited" as const,
  version: 1,
  eligible: true,
};

it("shows role counts, an add form and one compact row per person", () => {
  render(
    <AdminMemberList
      filters={{ state: "invited", role: "author", search: "new" }}
      summary={summary}
      currentUserId="90000000-0000-0000-0000-000000000004"
      page={{ items: [person], nextCursor: "safe-cursor" }}
    />,
  );
  const counts = screen.getByRole("list", { name: "Staff by role" });
  expect(
    within(counts).getByRole("link", { name: /3 Administrators/ }),
  ).toHaveAttribute(
    "href",
    "/dashboard/admin/members?state=active&role=administrator",
  );
  expect(within(counts).getByText("97")).toBeVisible();
  expect(screen.getByText("Add people")).toBeVisible();
  expect(screen.getByRole("heading", { name: "new@bc.edu" })).toBeVisible();
  expect(
    screen.getByText("Not signed in yet", { selector: "span" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Role for new@bc.edu")).toHaveValue("author");
  expect(
    screen.getByRole("button", { name: "Remove new@bc.edu" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard/admin/members?cursor=safe-cursor&state=invited&role=author&q=new",
  );
  expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
});

it("says so when nobody matches", () => {
  render(
    <AdminMemberList
      filters={{ state: "all", role: null, search: "zz" }}
      summary={summary}
      currentUserId="x"
      page={{ items: [], nextCursor: null }}
    />,
  );
  expect(screen.getByText("No one matches this filter.")).toBeVisible();
});
