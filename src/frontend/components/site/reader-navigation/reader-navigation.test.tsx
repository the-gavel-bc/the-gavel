import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
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
