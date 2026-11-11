import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  homepage: vi.fn(),
  footer: vi.fn(),
  navigation: vi.fn(),
}));
vi.mock("@/backend/public-homepage/public-homepage", () => ({
  getPublicHomepageForRequest: mocks.homepage,
  getPublicReadThis: mocks.footer,
}));
vi.mock(
  "@/backend/public-site/public-site-navigation/public-site-navigation",
  () => ({
    getPublicSiteNavigationForRequest: mocks.navigation,
  }),
);
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import HomeLayout from "./layout";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.navigation.mockResolvedValue({ kind: "unavailable" });
});
it("uses the page's request-scoped full projection for the homepage footer", async () => {
  mocks.homepage.mockResolvedValue({
    kind: "ok",
    readThis: [{ title: "Same snapshot", slug: "same-snapshot" }],
  });
  render(await HomeLayout({ children: <h1>Home content</h1> }));
  expect(mocks.homepage).toHaveBeenCalledTimes(1);
  expect(mocks.footer).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Same snapshot" })).toHaveAttribute(
    "href",
    "/articles/same-snapshot",
  );
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
});
it("preserves the shell when the homepage projection is unavailable", async () => {
  mocks.homepage.mockResolvedValue({ kind: "unavailable" });
  render(await HomeLayout({ children: <h1>Unavailable content</h1> }));
  expect(
    screen.getByRole("heading", { name: "Unavailable content" }),
  ).toBeVisible();
  expect(screen.getByRole("search")).toBeVisible();
  expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  expect(mocks.footer).not.toHaveBeenCalled();
});
