import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  footer: vi.fn(),
  homepage: vi.fn(),
}));
vi.mock("@/backend/public-homepage/public-homepage", () => ({
  getPublicHomepageForRequest: mocks.homepage,
  getPublicReadThis: mocks.footer,
}));
vi.mock(
  "@/backend/public-site/public-site-navigation/public-site-navigation",
  () => ({ getPublicSiteNavigationForRequest: mocks.read }),
);
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
import PublicLayout from "./layout";
it("loads only narrow footer data and renders a single shell", async () => {
  mocks.footer.mockResolvedValue({
    kind: "ok",
    readThis: [{ title: "Footer story", slug: "footer-story" }],
  });
  mocks.read.mockResolvedValue({
    kind: "ok",
    sections: [{ name: "News", slug: "news", categories: [] }],
    information: {
      mission: "Mission",
      contactEmail: null,
      instagramUrl: null,
      spotifyUrl: null,
      linkedinUrl: null,
      facebookUrl: null,
      submissionInstructions: null,
    },
  });
  render(await PublicLayout({ children: <h1>Latest stories</h1> }));
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.footer).toHaveBeenCalledTimes(1);
  expect(mocks.homepage).not.toHaveBeenCalled();
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
  mocks.footer.mockResolvedValue({ kind: "unavailable" });
  render(await PublicLayout({ children: <h1>Latest stories</h1> }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "Navigation is temporarily unavailable",
  );
  expect(screen.queryByRole("link", { name: "News" })).not.toBeInTheDocument();
  expect(screen.getByRole("search")).toBeVisible();
});
