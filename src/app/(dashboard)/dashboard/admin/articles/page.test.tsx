import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock("@/lib/articles/admin-article-queries/admin-article-queries", () => ({
  getAdminArticlesPage: mocks.list,
}));
import Page from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.list.mockResolvedValue({ items: [], nextCursor: null });
});
it("blocks an author before the admin query", async () => {
  mocks.guard.mockResolvedValue({ status: "active", role: "author" });
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Administrator access required.",
  );
  expect(mocks.list).not.toHaveBeenCalled();
});
it("shows an empty list and native status/title filters", async () => {
  render(
    await Page({
      searchParams: Promise.resolve({ status: "archived", search: "News" }),
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Article management" }),
  ).toBeVisible();
  expect(screen.getByText("No articles match these filters.")).toBeVisible();
  expect(screen.getByLabelText("Status")).toHaveValue("archived");
  expect(screen.getByLabelText("Search article titles")).toHaveValue("News");
  expect(mocks.list).toHaveBeenCalledWith({
    status: "archived",
    search: "News",
  });
});
