import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));
import { RouteTransition, skeletonFor } from "./route-transition";

const here = new URL("http://localhost/sections/news");
const at = (path: string) => new URL(path, here);

beforeEach(() => {
  pathname = "/";
  // Links in jsdom don't navigate; stop the default so nothing is logged.
  document.addEventListener("click", prevent);
});
afterEach(() => {
  document.removeEventListener("click", prevent);
  vi.useRealTimers();
});
const prevent = (event: Event) => event.preventDefault();

it("picks a skeleton only for internal navigations to another page", () => {
  expect(skeletonFor(at("/articles/a-story"), here)).toBe("article");
  expect(skeletonFor(at("/tags/campus"), here)).toBe("list");
  expect(skeletonFor(at("/sections/news?cursor=x"), here)).toBe("list");
  expect(skeletonFor(at("/sections/news#top"), here)).toBeNull();
  expect(skeletonFor(new URL("https://example.com/a"), here)).toBeNull();
  expect(skeletonFor(at("/dashboard"), here)).toBeNull();
  expect(skeletonFor(at("/sign-in"), here)).toBeNull();
});

it("shows a skeleton on link click and clears it when the route renders", () => {
  const view = render(
    <RouteTransition>
      <a href="/articles/a-story">A story</a>
    </RouteTransition>,
  );
  fireEvent.click(screen.getByRole("link", { name: "A story" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(screen.queryByRole("link", { name: "A story" })).toBeNull();

  pathname = "/articles/a-story";
  view.rerender(
    <RouteTransition>
      <h1>A story</h1>
    </RouteTransition>,
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("heading", { name: "A story" })).toBeVisible();
});

it("ignores new-tab clicks and gives up on a stalled navigation", () => {
  vi.useFakeTimers();
  render(
    <RouteTransition>
      <a href="/tags/campus">Campus</a>
    </RouteTransition>,
  );
  const link = screen.getByRole("link", { name: "Campus" });
  fireEvent.click(link, { metaKey: true });
  expect(screen.queryByRole("status")).toBeNull();

  fireEvent.click(link);
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("link", { name: "Campus" })).toBeVisible();
});
