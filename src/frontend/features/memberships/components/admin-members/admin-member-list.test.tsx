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

const summary = {
  administrators: 3,
  editors: 0,
  authors: 97,
  invited: 5,
  inactive: 2,
};
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

it("starts on the All pill with counts and links a name to that person's activity", () => {
  render(
    <AdminMemberList
      filters={{ state: "all", role: null, search: "" }}
      summary={summary}
      currentUserId="90000000-0000-0000-0000-000000000004"
      page={{ items: [person], nextCursor: "safe-cursor" }}
    />,
  );
  const pills = screen.getByRole("navigation", { name: "Filter people" });
  const all = within(pills).getByRole("link", { name: /^All/ });
  expect(all).toHaveAttribute("aria-current", "page");
  expect(all).toHaveTextContent("107");
  expect(
    within(pills).getByRole("link", { name: /Administrators/ }),
  ).toHaveAttribute(
    "href",
    "/dashboard/admin/members?state=active&role=administrator",
  );
  expect(
    screen.getByRole("searchbox", { name: "Search people" }),
  ).toBeVisible();
  expect(screen.getByText("Add people")).toBeVisible();
  expect(screen.getByRole("link", { name: "new@bc.edu" })).toHaveAttribute(
    "href",
    `/dashboard/admin/members/audit?user=${person.key}`,
  );
  expect(
    screen.getByText("Not signed in yet", { selector: "span" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Role for new@bc.edu")).toHaveValue("author");
  expect(screen.queryByText("Membership activity")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard/admin/members?cursor=safe-cursor",
  );
});

it("marks the active pill and keeps the search in every pill", () => {
  render(
    <AdminMemberList
      filters={{ state: "invited", role: null, search: "new" }}
      summary={summary}
      currentUserId="x"
      page={{ items: [person], nextCursor: null }}
    />,
  );
  const pills = screen.getByRole("navigation", { name: "Filter people" });
  expect(
    within(pills).getByRole("link", { name: /Not signed in yet/ }),
  ).toHaveAttribute("aria-current", "page");
  expect(within(pills).getByRole("link", { name: /^All/ })).toHaveAttribute(
    "href",
    "/dashboard/admin/members?q=new",
  );
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
