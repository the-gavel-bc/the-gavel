import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  usePathname: () => "/missing",
  useSearchParams: () => new URLSearchParams(),
}));
// The root boundary renders per request so it receives a CSP nonce.
const connection = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("next/server", () => ({ connection }));
import RootNotFound from "@/app/not-found";
import ArticleNotFound from "@/app/(public)/articles/[slug]/not-found";
import { ArchiveNotFound } from "../archive-grid/archive-not-found";
it("gives unmatched URLs one public shell and recovery search without backend reads", async () => {
  render(await RootNotFound());
  expect(connection).toHaveBeenCalledOnce();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Page not found",
  );
  expect(
    screen.getByRole("main").querySelector('form[action="/search"]'),
  ).not.toBeNull();
  expect(
    within(screen.getByRole("main")).getByRole("link", {
      name: "Home",
    }),
  ).toHaveAttribute("href", "/");
});
it.each([
  [ArticleNotFound, "Article not found"],
  [ArchiveNotFound, "Archive not found"],
] as const)(
  "adds search to resource recovery without duplicate shells",
  (Component, title) => {
    render(<Component />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(title);
    expect(
      screen.getByRole("searchbox", { name: "Search stories" }),
    ).toBeVisible();
    expect(screen.queryByRole("main")).toBeNull();
  },
);
