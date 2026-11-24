import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BackToTop } from "./back-to-top";

it("glides to the top and focuses the main content", () => {
  const scrollTo = vi.fn();
  window.scrollTo = scrollTo;
  render(
    <main id="main-content" tabIndex={-1}>
      <BackToTop href="#top">Back to top</BackToTop>
    </main>,
  );
  const link = screen.getByRole("link", { name: "Back to top" });
  expect(link).toHaveAttribute("href", "#top");
  expect(fireEvent.click(link)).toBe(false);
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  expect(screen.getByRole("main")).toHaveFocus();
});

it("jumps instead when the reader prefers reduced motion", () => {
  const scrollTo = vi.fn();
  window.scrollTo = scrollTo;
  const original = window.matchMedia;
  window.matchMedia = vi.fn(() => ({
    matches: true,
  })) as unknown as typeof window.matchMedia;
  render(<BackToTop>Back to top</BackToTop>);
  fireEvent.click(screen.getByRole("link", { name: "Back to top" }));
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  window.matchMedia = original;
});
