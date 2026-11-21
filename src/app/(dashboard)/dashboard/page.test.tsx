import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock(
  "@/backend/articles/article-lifecycle/article-lifecycle-actions",
  () => ({ archiveArticleAction: vi.fn(), restoreArticleAction: vi.fn() }),
);
vi.mock("@/backend/articles/article-deletion/article-deletion-actions", () => ({
  deleteArticleAction: vi.fn(),
}));
import DashboardLayout from "./layout";
import DashboardPage from "./page";
const access = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
vi.mock("@/backend/articles/draft-queries/draft-queries", () => ({
  getMyArticlesPage: query,
}));
const params = (cursor?: string | string[]) => ({
  searchParams: Promise.resolve({ cursor }),
});
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: access,
}));
vi.mock("@/backend/auth/actions/actions", () => ({ signOut: vi.fn() }));
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
it("server-renders safe recovery for repeated cursors and read failures", async () => {
  access.mockResolvedValue({ status: "active" });
  const first = render(await DashboardPage(params(["one", "two"])));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load your articles",
  );
  first.unmount();
  query.mockRejectedValue(new Error("private SQL error"));
  render(await DashboardPage(params()));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load your articles",
  );
  expect(screen.queryByText(/private SQL error/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});
it("keeps status and search filters on the retry link", async () => {
  access.mockResolvedValue({ status: "active" });
  query.mockRejectedValue(new Error("private SQL error"));
  render(
    await DashboardPage({
      searchParams: Promise.resolve({
        cursor: "page-two",
        status: "published",
        search: "campus news",
      }),
    }),
  );
  expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
    "href",
    "/dashboard?status=published&search=campus+news&cursor=page-two",
  );
  expect(screen.getByRole("link", { name: "Newest articles" })).toHaveAttribute(
    "href",
    "/dashboard?status=published&search=campus+news",
  );
});
it("does not mask a query guard's redirect during recovery", async () => {
  access.mockResolvedValue({ status: "active" });
  const { redirect } = await import("next/navigation");
  query.mockImplementation(() => redirect("/access-pending"));
  await expect(DashboardPage(params())).rejects.toThrow("NEXT_REDIRECT");
});
