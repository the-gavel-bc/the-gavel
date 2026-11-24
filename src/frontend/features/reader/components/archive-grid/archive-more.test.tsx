import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/backend/public-articles/archive-more/archive-more-action", () => ({
  loadMoreArchiveArticles: mocks.load,
}));
import { ArchiveMore } from "./archive-more";

const section = { name: "News", slug: "news", categories: [] };
const card = (n: number) => ({
  id: `53000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  title: `Story ${n}`,
  slug: `story-${n}`,
  excerpt: null,
  publishedAt: "2026-11-09T00:00:00Z",
  section,
  owner: { displayName: "Writer", slug: "writer" },
  writers: [],
  mainImage: null,
});
const press = async (name = "Load more articles") => {
  const link = screen.getByRole("link", { name });
  const allowed = fireEvent.click(link);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return allowed;
};
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/sections/news");
});

it("is a real link to the next page", () => {
  render(
    <ArchiveMore href="/sections/news" newestHref={null} nextCursor="c1" />,
  );
  expect(
    screen.getByRole("link", { name: "Load more articles" }),
  ).toHaveAttribute("href", "/sections/news?cursor=c1");
});

it("appends the next stories below, announces them and moves focus", async () => {
  mocks.load.mockResolvedValueOnce({
    ok: true,
    items: [card(13), card(14)],
    nextCursor: "c2",
  });
  render(
    <ArchiveMore href="/sections/news" newestHref={null} nextCursor="c1" />,
  );
  const allowed = await press();
  expect(allowed).toBe(false);
  expect(mocks.load).toHaveBeenCalledWith("/sections/news", "c1");
  expect(screen.getByRole("heading", { name: "Story 13" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "2 more articles loaded.",
  );
  expect(window.location.search).toBe("?cursor=c1");
  expect(
    screen.getByRole("link", { name: "Load more articles" }),
  ).toHaveAttribute("href", "/sections/news?cursor=c2");
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(document.activeElement).toHaveAttribute("href", "/articles/story-13");
});

it("says when there are no older articles and removes the button", async () => {
  mocks.load.mockResolvedValueOnce({
    ok: true,
    items: [card(13)],
    nextCursor: null,
  });
  render(
    <ArchiveMore href="/sections/news" newestHref={null} nextCursor="c1" />,
  );
  await press();
  expect(screen.getByRole("status")).toHaveTextContent("No older articles.");
  expect(screen.queryByRole("link", { name: "Load more articles" })).toBeNull();
});

it("falls back to the plain link after a failure", async () => {
  mocks.load.mockResolvedValueOnce({ ok: false });
  render(
    <ArchiveMore href="/sections/news" newestHref={null} nextCursor="c1" />,
  );
  await press();
  expect(screen.getByRole("status")).toHaveTextContent("could not load");
  expect(await press()).toBe(true);
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it("stops appending after five loads and lets the link open a fresh page", async () => {
  for (let n = 0; n < 5; n++)
    mocks.load.mockResolvedValueOnce({
      ok: true,
      items: [card(20 + n)],
      nextCursor: `c${n + 2}`,
    });
  render(
    <ArchiveMore href="/sections/news" newestHref={null} nextCursor="c1" />,
  );
  for (let n = 0; n < 5; n++) expect(await press()).toBe(false);
  expect(await press()).toBe(true);
  expect(mocks.load).toHaveBeenCalledTimes(5);
  expect(screen.getByRole("link", { name: "Back to top" })).toHaveAttribute(
    "href",
    "#main-content",
  );
});

it("leaves modified clicks (new tab) to the browser", async () => {
  render(
    <ArchiveMore href="/sections/news" newestHref={null} nextCursor="c1" />,
  );
  expect(
    fireEvent.click(screen.getByRole("link", { name: "Load more articles" }), {
      metaKey: true,
    }),
  ).toBe(true);
  expect(mocks.load).not.toHaveBeenCalled();
});

it("continues the same grid, so new stories fill the row the last one left open", async () => {
  mocks.load.mockResolvedValueOnce({
    ok: true,
    items: [card(13)],
    nextCursor: null,
  });
  render(
    <ArchiveMore href="/sections/news" newestHref={null} nextCursor="c1">
      <article>
        <h2>Story 12</h2>
      </article>
    </ArchiveMore>,
  );
  await press();
  const existing = screen
    .getByRole("heading", { name: "Story 12" })
    .closest("article");
  const added = screen
    .getByRole("heading", { name: "Story 13" })
    .closest("article");
  expect(added?.parentElement).toBe(existing?.parentElement);
  // The announcement is for screen readers; it is not shown on screen.
  expect(screen.getByRole("status").className).toMatch(/srOnly/);
});

it("glides back to the top and focuses the main content", async () => {
  mocks.load.mockResolvedValueOnce({
    ok: true,
    items: [card(13)],
    nextCursor: "c2",
  });
  const scrollTo = vi.fn();
  window.scrollTo = scrollTo;
  render(
    <main id="main-content" tabIndex={-1}>
      <ArchiveMore href="/sections/news" newestHref={null} nextCursor="c1" />
    </main>,
  );
  await press();
  fireEvent.click(screen.getByRole("link", { name: "Back to top" }));
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  expect(screen.getByRole("main")).toHaveFocus();
});
