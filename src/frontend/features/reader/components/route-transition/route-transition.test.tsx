/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors stand in for rendered links. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { RouteTransition, skeletonFor } from "./route-transition";

const here = new URL("http://localhost/sections/news");
const at = (path: string) => new URL(path, here);

beforeEach(() => {
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
  expect(skeletonFor(at("/"), here)).toBe("home");
  expect(skeletonFor(at("/tags/campus"), here)).toBe("archive");
  expect(skeletonFor(at("/sections/news?cursor=x"), here)).toBe("archive");
  expect(skeletonFor(at("/letters"), here)).toBe("archive");
  expect(skeletonFor(at("/authors/avery"), here)).toBe("author");
  expect(skeletonFor(at("/search?q=x"), here)).toBe("search");
  expect(skeletonFor(at("/about"), here)).toBe("page");
  expect(skeletonFor(at("/letters/how-to-submit"), here)).toBe("page");
  expect(skeletonFor(at("/sections/news#top"), here)).toBeNull();
  expect(skeletonFor(new URL("https://example.com/a"), here)).toBeNull();
  expect(skeletonFor(at("/dashboard"), here)).toBeNull();
  expect(skeletonFor(at("/sign-in"), here)).toBeNull();
});

it("shows a skeleton on a slow navigation and clears it when the route renders", () => {
  vi.useFakeTimers();
  const view = render(
    <RouteTransition>
      <a href="/articles/a-story">A story</a>
    </RouteTransition>,
  );
  fireEvent.click(screen.getByRole("link", { name: "A story" }));
  // A typical navigation never shows the skeleton.
  act(() => vi.advanceTimersByTime(1400));
  expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(100));
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  // Shaped like the destination: an article, not a list.
  expect(screen.getByRole("status").closest("[data-skeleton]")).toHaveAttribute(
    "data-skeleton",
    "article",
  );
  expect(screen.queryByRole("link", { name: "A story" })).toBeNull();

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
  act(() => vi.advanceTimersByTime(1500));
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("link", { name: "Campus" })).toBeVisible();
});
