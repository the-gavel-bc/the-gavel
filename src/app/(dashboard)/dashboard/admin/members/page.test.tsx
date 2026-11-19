import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  list: vi.fn(),
  summary: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock(
  "@/backend/memberships/member-directory/member-directory",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/backend/memberships/member-directory/member-directory")
      >();
    return {
      ...actual,
      listMembers: mocks.list,
      staffSummary: mocks.summary,
    };
  },
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/backend/memberships/invitation-command/invitation-actions", () => ({
  manageInvitationAction: vi.fn(),
}));
import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({
    status: "active",
    role: "administrator",
    userId: "90000000-0000-0000-0000-000000000004",
  });
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  mocks.summary.mockResolvedValue({
    administrators: 1,
    authors: 0,
    invited: 0,
    inactive: 0,
  });
});

it("blocks authors before the member directory query", async () => {
  mocks.guard.mockResolvedValue({ status: "active", role: "author" });
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Administrator access required.",
  );
  expect(mocks.list).not.toHaveBeenCalled();
});

it("renders native filter and safe empty state", async () => {
  render(await Page({ searchParams: Promise.resolve({ state: "invited" }) }));
  expect(screen.getByRole("heading", { name: "Memberships" })).toBeVisible();
  expect(screen.getByLabelText("State")).toHaveValue("invited");
  expect(screen.getByText("No one matches this filter.")).toBeVisible();
  expect(mocks.list).toHaveBeenCalledWith({ state: "invited" });
});

it("offers a safe reset after invalid filter or cursor", async () => {
  mocks.list.mockRejectedValueOnce(
    new Error("Invalid membership list request."),
  );
  render(await Page({ searchParams: Promise.resolve({ cursor: "bad" }) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load memberships.",
  );
  expect(screen.getByRole("link", { name: "Reset filter" })).toHaveAttribute(
    "href",
    "/dashboard/admin/members",
  );
});
