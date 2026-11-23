import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MemberAuditPage from "./page";

const mocks = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.access,
}));
vi.mock(
  "@/backend/memberships/member-audit/member-audit",
  async (original) => ({
    ...(await original<
      typeof import("@/backend/memberships/member-audit/member-audit")
    >()),
    listMemberAudit: mocks.read,
  }),
);

const user = "00000000-0000-0000-0000-000000000021";
const searchParams = Promise.resolve({
  user,
  cursor: ["current"],
  extra: "ignored",
});

it.each(["author", "editor"])(
  "refuses %s before loading membership activity",
  async (role) => {
    mocks.access.mockResolvedValue({ role });
    mocks.read.mockClear();
    render(await MemberAuditPage({ searchParams }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Administrator access required.",
    );
    expect(mocks.read).not.toHaveBeenCalled();
  },
);

it("shows role changes and preserves the user filter on the next page", async () => {
  mocks.access.mockResolvedValue({ role: "administrator" });
  mocks.read.mockResolvedValue({
    items: [
      {
        id: "00000000-0000-0000-0000-000000000022",
        action: "membership.role_changed",
        targetEmail: "reporter@bc.edu",
        actorLabel: "Desk",
        createdAt: "2026-01-15T02:30:00Z",
        detail: { previousRole: "author", newRole: "editor" },
      },
    ],
    nextCursor: "next",
  });
  render(await MemberAuditPage({ searchParams }));
  expect(mocks.read).toHaveBeenLastCalledWith({ user, cursor: "current" });
  expect(screen.getByRole("heading")).toHaveTextContent("reporter@bc.edu");
  expect(screen.getByRole("listitem")).toHaveTextContent(/Author → Editor/);
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    `/dashboard/admin/members/audit?user=${user}&cursor=next`,
  );
});
