import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), detail: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.guard,
}));
vi.mock(
  "@/backend/articles/admin-article-queries/admin-article-queries",
  () => ({
    getAdminArticleDetail: mocks.detail,
  }),
);
vi.mock(
  "@/backend/articles/article-lifecycle/article-lifecycle-actions",
  () => ({
    restoreArticleAction: vi.fn(),
  }),
);
vi.mock("next/navigation", async (load) => ({
  ...(await load<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
import Page from "./page";
const id = "00000000-0000-0000-0000-000000000123";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ status: "active", role: "administrator" });
  mocks.detail.mockResolvedValue({
    id,
    title: "News story",
    status: "archived",
    version: 3,
    updatedAt: "2026-11-05T12:00:00Z",
    ownerName: "Writer",
    sectionName: "News",
  });
});
it("shows restore only for archived admin detail", async () => {
  render(await Page({ params: Promise.resolve({ id }) }));
  expect(screen.getByRole("button", { name: "Restore article" })).toBeVisible();
  expect(screen.getByText("Writer")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Edit article" }),
  ).not.toBeInTheDocument();
});
it("does not query admin detail for an author", async () => {
  mocks.guard.mockResolvedValue({ status: "active", role: "author" });
  render(await Page({ params: Promise.resolve({ id }) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Administrator access required.",
  );
  expect(mocks.detail).not.toHaveBeenCalled();
});
it("hides missing admin article details", async () => {
  mocks.detail.mockResolvedValueOnce(null);
  await expect(Page({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "NEXT_HTTP_ERROR_FALLBACK",
  );
});
