import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/backend/public-homepage/public-homepage", () => ({
  getPublicHomepageForRequest: () =>
    Promise.resolve({
      kind: "ok",
      lead: null,
      featured: [],
      latest: [],
      readThis: [{ title: "Footer story", slug: "footer-story" }],
      sections: [],
    }),
}));
vi.mock(
  "@/backend/public-site/public-site-navigation/public-site-navigation",
  () => ({ getPublicSiteNavigationForRequest: mocks.read }),
);
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import PublicLayout from "./layout";
it("loads public data once and renders a single shell", async () => {
  mocks.read.mockResolvedValue({
    kind: "ok",
    sections: [{ name: "News", slug: "news", categories: [] }],
    information: {
      mission: "Mission",
      contactEmail: null,
      instagramUrl: null,
      submissionInstructions: null,
    },
  });
  render(await PublicLayout({ children: <h1>Latest stories</h1> }));
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  expect(screen.getByText("Mission")).toBeVisible();
  expect(screen.getByRole("link", { name: "Footer story" })).toHaveAttribute(
    "href",
    "/articles/footer-story",
  );
});
it("keeps static navigation available without inventing taxonomy", async () => {
  mocks.read.mockResolvedValue({ kind: "unavailable" });
  render(await PublicLayout({ children: <h1>Latest stories</h1> }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Navigation is temporarily unavailable",
  );
  expect(screen.queryByRole("link", { name: "News" })).not.toBeInTheDocument();
  expect(screen.getByRole("search")).toBeVisible();
});
