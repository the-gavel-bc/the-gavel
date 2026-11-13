import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
import { ReaderNavigation } from "./reader-navigation";
let wide: boolean;
let synchronize: () => void;
beforeEach(() => {
  wide = true;
  vi.stubGlobal("matchMedia", () => ({
    matches: wide,
    addEventListener: (_: string, callback: () => void) => {
      synchronize = callback;
    },
    removeEventListener: vi.fn(),
  }));
});
it("preserves desktop primary navigation and keyboard focus on Escape", () => {
  render(<ReaderNavigation sections={[]} />);
  const home = screen.getByRole("link", { name: "Home" });
  home.focus();
  fireEvent.keyDown(home, { key: "Escape" });
  expect(home.closest("details")).toHaveAttribute("open");
  expect(home).toHaveFocus();
});
it("closes mobile navigation and restores focus to its summary", () => {
  wide = false;
  render(<ReaderNavigation sections={[]} />);
  const home = screen.getByRole("link", { name: "Home", hidden: true });
  const menu = home.closest("details")!;
  menu.open = true;
  home.focus();
  fireEvent.keyDown(home, { key: "Escape" });
  expect(menu.open).toBe(false);
  expect(menu.querySelector("summary")).toHaveFocus();
});
it("respects a viewport change before handling Escape", () => {
  render(<ReaderNavigation sections={[]} />);
  const home = screen.getByRole("link", { name: "Home" });
  const menu = home.closest("details")!;
  wide = false;
  synchronize();
  menu.open = true;
  fireEvent.keyDown(home, { key: "Escape" });
  expect(menu.open).toBe(false);
  wide = true;
  synchronize();
  fireEvent.keyDown(home, { key: "Escape" });
  expect(menu.open).toBe(true);
});
it("matches the live menu: category dropdowns and How to Submit under letters", () => {
  render(
    <ReaderNavigation
      sections={[
        {
          name: "Sports",
          slug: "sports",
          categories: [
            { name: "Football", slug: "football" },
            { name: "Press Pass", slug: "press-pass" },
          ],
        },
        {
          name: "Letter to the Editor",
          slug: "letter-to-the-editor",
          categories: [],
        },
      ]}
    />,
  );
  const nav = screen.getByRole("navigation", { name: "Primary navigation" });
  expect(within(nav).getByRole("link", { name: "Press Pass" })).toHaveAttribute(
    "href",
    "/sections/sports/categories/press-pass",
  );
  expect(within(nav).getByText("Categories for Sports")).toBeInTheDocument();
  expect(
    within(nav).getByRole("link", { name: "Letter to the Editor" }),
  ).toHaveAttribute("href", "/letters");
  expect(
    within(nav).getByText("Links for Letter to the Editor"),
  ).toBeInTheDocument();
  expect(
    within(nav).getByRole("link", { name: "How to Submit" }),
  ).toHaveAttribute("href", "/letters/how-to-submit");
});
it("opens a category dropdown on mouse hover and closes it on leave", () => {
  render(
    <ReaderNavigation
      sections={[
        {
          name: "News",
          slug: "news",
          categories: [{ name: "Campus", slug: "campus" }],
        },
      ]}
    />,
  );
  const item = screen.getByRole("link", { name: "News" }).closest("li")!;
  const dropdown = item.querySelector("details")!;
  fireEvent.pointerEnter(item, { pointerType: "touch" });
  expect(dropdown.open).toBe(false);
  fireEvent.pointerEnter(item, { pointerType: "mouse" });
  expect(dropdown.open).toBe(true);
  // Clicking the caret of a hover-opened dropdown keeps it open.
  fireEvent.click(dropdown.querySelector("summary")!);
  expect(dropdown.open).toBe(true);
  fireEvent.pointerLeave(item, { pointerType: "mouse" });
  expect(dropdown.open).toBe(false);
});
it("keeps one category dropdown open and closes it on an outside tap", () => {
  render(
    <ReaderNavigation
      sections={[
        {
          name: "News",
          slug: "news",
          categories: [{ name: "Campus", slug: "campus" }],
        },
        {
          name: "Sports",
          slug: "sports",
          categories: [{ name: "Hockey", slug: "hockey" }],
        },
      ]}
    />,
  );
  const dropdown = (name: string) =>
    screen.getByRole("link", { name }).closest("li")!.querySelector("details")!;
  const news = dropdown("News");
  const sports = dropdown("Sports");
  news.open = true;
  fireEvent(news, new Event("toggle"));
  sports.open = true;
  fireEvent(sports, new Event("toggle"));
  expect(news.open).toBe(false);
  expect(sports.open).toBe(true);
  // Taps inside the open dropdown keep it open; taps elsewhere close it.
  fireEvent.pointerDown(sports.querySelector("ul")!);
  expect(sports.open).toBe(true);
  fireEvent.pointerDown(document.body);
  expect(sports.open).toBe(false);
});
