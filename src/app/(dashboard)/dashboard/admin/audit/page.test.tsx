import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/lib/articles/admin-audit/admin-audit", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/articles/admin-audit/admin-audit")
    >();
  return { ...actual, listAuditEvents: mocks.list };
});
import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
});

it("blocks an author before reading activity", async () => {
  mocks.guard.mockResolvedValue({ status: "active", role: "author" });
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Administrator access required.",
  );
  expect(mocks.list).not.toHaveBeenCalled();
});

it("shows a native action filter and empty state", async () => {
  render(
    await Page({
      searchParams: Promise.resolve({ action: "article.archived" }),
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Article activity" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Action")).toHaveValue("article.archived");
  expect(
    screen.getByText("No article activity matches this filter."),
  ).toBeVisible();
  expect(mocks.list).toHaveBeenCalledWith({ action: "article.archived" });
});

it("maps all to no action filter and gives a safe recovery on bad cursor", async () => {
  render(await Page({ searchParams: Promise.resolve({ action: "all" }) }));
  expect(mocks.list).toHaveBeenCalledWith({});
  mocks.list.mockRejectedValueOnce(new Error("Invalid audit request."));
  render(await Page({ searchParams: Promise.resolve({ cursor: "bad" }) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load article activity.",
  );
  expect(screen.getByRole("link", { name: "Reset filter" })).toHaveAttribute(
    "href",
    "/dashboard/admin/audit",
  );
});
