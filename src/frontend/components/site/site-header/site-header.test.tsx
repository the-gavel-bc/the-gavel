import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  usePathname: () => "/sections/news/categories/campus",
}));
import { SiteHeader } from "./site-header";
import { SiteFooter } from "../site-footer/site-footer";
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
const sections = [
  {
    name: "News",
    slug: "news",
    categories: [{ name: "Campus", slug: "campus" }],
  },
];
it("renders configured taxonomy and native GET search", () => {
  render(<SiteHeader sections={sections} />);
  expect(screen.getByRole("link", { name: "News" })).toHaveAttribute(
    "href",
    "/sections/news",
  );
  expect(
    screen.getByRole("link", { name: "Campus", hidden: true }),
  ).toHaveAttribute("href", "/sections/news/categories/campus");
  expect(
    screen.getByRole("link", { name: "Campus", hidden: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("search")).toHaveAttribute("action", "/search");
  expect(
    screen.getByRole("searchbox", { name: "Search stories" }),
  ).toHaveAttribute("name", "q");
});
it("closes the nearest disclosure on Escape and restores focus", () => {
  render(<SiteHeader sections={sections} />);
  const link = screen.getByRole("link", { name: "Campus", hidden: true });
  const detail = link.closest("details")!;
  detail.open = true;
  link.focus();
  fireEvent.keyDown(link, { key: "Escape" });
  expect(detail.open).toBe(false);
  expect(detail.querySelector("summary")).toHaveFocus();
  fireEvent.keyDown(detail.querySelector("summary")!, { key: "Escape" });
  expect(detail.parentElement?.closest("details")?.open).toBe(true);
});
it("encodes reserved characters in contact links", () => {
  render(
    <SiteFooter
      information={{
        mission: null,
        contactEmail: "desk?letters@bc.edu",
        instagramUrl: null,
        submissionInstructions: null,
      }}
    />,
  );
  expect(
    screen.getByRole("link", { name: "desk?letters@bc.edu" }),
  ).toHaveAttribute("href", "mailto:desk%3Fletters%40bc.edu");
});
it("footer omits unknown information and accepts a typed Read This slot", () => {
  const { rerender } = render(<SiteFooter />);
  expect(screen.queryByText("Read This")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Instagram" }),
  ).not.toBeInTheDocument();
  rerender(
    <SiteFooter
      information={{
        mission: "Our mission",
        contactEmail: "editor@bc.edu",
        instagramUrl: "https://instagram.com/thegavel/",
        submissionInstructions: "Write to us",
      }}
      readThis={[{ title: "A story", slug: "a-story" }]}
    />,
  );
  expect(screen.getByRole("link", { name: "A story" })).toHaveAttribute(
    "href",
    "/articles/a-story",
  );
  expect(screen.getByRole("link", { name: "editor@bc.edu" })).toHaveAttribute(
    "href",
    "mailto:editor%40bc.edu",
  );
});
