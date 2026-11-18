/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors stand in for rendered links. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { RouteTransition, skeletonFor } from "./route-transition";

const here = new URL("http://localhost/sections/news");
const at = (path: string) => new URL(path, here);

beforeEach(() => {
  // Links in jsdom don't navigate; stop the default so nothing is logged.
  document.addEventListener("click", prevent);
  history.replaceState(null, "", "/sections/news");
  vi.useFakeTimers();
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

// The App Router gives layouts one stable `children` element for every page,
// so these tests never swap children: only the URL changes, as in Next.js.
const page = (
  <>
    <a href="/articles/a-story">A story</a>
    <a href="/sections/news?cursor=next">Older articles</a>
    <a href="/tags/campus" target="_blank">
      New tab
    </a>
  </>
);
const mount = () => render(<RouteTransition>{page}</RouteTransition>);
const skeleton = () => document.querySelector("[data-skeleton]");
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
// What the router does when the destination commits.
// Advances time in small steps, failing if a skeleton shows at any moment.
const neverDuring = (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    wait(100);
    expect(skeleton(), `skeleton visible after ${elapsed + 100}ms`).toBeNull();
  }
};
const arrive = (path: string) => act(() => history.pushState(null, "", path));

it("never shows a skeleton for a navigation that finishes quickly", () => {
  mount();
  fireEvent.click(screen.getByRole("link", { name: "A story" }));
  wait(200);
  arrive("/articles/a-story");
  // Long after arrival, with children unchanged, nothing may appear.
  neverDuring(10_000);
  expect(screen.getByRole("link", { name: "A story" })).toBeVisible();
});

it("never shows a skeleton after a quick query-only navigation", () => {
  mount();
  fireEvent.click(screen.getByRole("link", { name: "Older articles" }));
  wait(100);
  arrive("/sections/news?cursor=next");
  neverDuring(10_000);
});

it("shows the destination's skeleton only after 1.5s, and clears it on arrival", () => {
  mount();
  fireEvent.click(screen.getByRole("link", { name: "A story" }));
  wait(1400);
  expect(skeleton()).toBeNull();
  wait(100);
  expect(skeleton()).toHaveAttribute("data-skeleton", "article");
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(screen.queryByRole("link", { name: "A story" })).toBeNull();
  arrive("/articles/a-story");
  wait(50);
  expect(skeleton()).toBeNull();
  expect(screen.getByRole("link", { name: "A story" })).toBeVisible();
});

it("clears when the reader goes back or forward mid-navigation", () => {
  mount();
  fireEvent.click(screen.getByRole("link", { name: "A story" }));
  wait(300);
  arrive("/about");
  neverDuring(5000);
});

it("ignores new-tab and modified clicks", () => {
  mount();
  fireEvent.click(screen.getByRole("link", { name: "New tab" }));
  fireEvent.click(screen.getByRole("link", { name: "A story" }), {
    metaKey: true,
  });
  neverDuring(5000);
});

it("gives up on a stalled navigation", () => {
  mount();
  fireEvent.click(screen.getByRole("link", { name: "A story" }));
  wait(1500);
  expect(skeleton()).not.toBeNull();
  wait(6500);
  expect(skeleton()).toBeNull();
  expect(screen.getByRole("link", { name: "A story" })).toBeVisible();
});

it("does not resume a skeleton on a page restored from the back/forward cache", () => {
  mount();
  fireEvent.click(screen.getByRole("link", { name: "A story" }));
  wait(500);
  act(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  neverDuring(5000);
});

it("starts from a GET form submission, such as search", () => {
  render(
    <RouteTransition>
      <form method="get" action="/search">
        <input name="q" defaultValue="campus" />
      </form>
    </RouteTransition>,
  );
  fireEvent.submit(document.querySelector("form")!);
  wait(1500);
  expect(skeleton()).toHaveAttribute("data-skeleton", "search");
});
