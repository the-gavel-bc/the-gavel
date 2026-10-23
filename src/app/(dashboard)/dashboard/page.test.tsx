import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import DashboardLayout from "./layout";
import DashboardPage from "./page";
const access = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/articles/draft-queries/draft-queries", () => ({
  getMyArticlesPage: query,
}));
const params = (cursor?: string | string[]) => ({
  searchParams: Promise.resolve({ cursor }),
});
vi.mock("@/lib/auth/access/access", () => ({
  requireActiveMembership: access,
}));
vi.mock("@/lib/auth/actions/actions", () => ({ signOut: vi.fn() }));
beforeEach(() => {
  access.mockReset();
  query.mockReset().mockResolvedValue({ items: [], nextCursor: null });
});
it("renders the approved author dashboard without admin navigation", async () => {
  access.mockResolvedValue({
    status: "active",
    userId: "a",
    profileId: "p",
    displayName: "Author A",
    role: "author",
  });
  render(await DashboardLayout({ children: await DashboardPage(params()) }));
  expect(screen.getByRole("heading", { name: "My articles" })).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Administration" }),
  ).not.toBeInTheDocument();
});
it.each(["/sign-in", "/access-pending"])(
  "guards layout and page independently: %s",
  async (destination) => {
    access.mockRejectedValue(new Error(`redirect:${destination}`));
    await expect(
      DashboardLayout({ children: <p>Private content</p> }),
    ).rejects.toThrow(`redirect:${destination}`);
    await expect(DashboardPage(params())).rejects.toThrow(
      `redirect:${destination}`,
    );
  },
);

it("loads the requested page and offers a way back to newest", async () => {
  access.mockResolvedValue({ status: "active" });
  query.mockImplementation(async ({ cursor }) => ({
    items: [
      {
        id: "article",
        title: cursor === "page-two" ? "Older draft" : "Wrong page",
        slug: "older",
        status: "draft",
        sectionId: "section",
        version: 1,
        updatedAt: "2026-10-22T12:00:00Z",
      },
    ],
    nextCursor: null,
  }));
  render(await DashboardPage(params("page-two")));
  expect(screen.getByRole("heading", { name: "Older draft" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Newest articles" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});
it("rejects repeated cursors and lets query failures reach the safe error boundary", async () => {
  access.mockResolvedValue({ status: "active" });
  await expect(DashboardPage(params(["one", "two"]))).rejects.toThrow(
    "Invalid article page request.",
  );
  query.mockRejectedValue(new Error("Unable to load articles."));
  await expect(DashboardPage(params())).rejects.toThrow(
    "Unable to load articles.",
  );
});
