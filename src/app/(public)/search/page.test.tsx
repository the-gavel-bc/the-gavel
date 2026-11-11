import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/backend/public-articles/public-search/public-search", () => ({
  searchPublicArticles: read,
}));
import Page, { metadata } from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue({
    kind: "ok",
    query: "campus",
    items: [],
    nextCursor: null,
  });
});
it("normalizes the query and makes exactly one checked read; metadata spends no ticket", async () => {
  render(
    await Page({
      searchParams: Promise.resolve({ q: "  campus\t", cursor: "token" }),
    }),
  );
  expect(read).toHaveBeenCalledExactlyOnceWith({
    query: "campus",
    cursor: "token",
  });
  expect(metadata).toMatchObject({ robots: { index: false, follow: false } });
  expect(screen.getByRole("searchbox")).toHaveValue("campus");
});
it.each([{}, { q: " \t" }])(
  "shows instructions without searching an empty query",
  async (input) => {
    render(await Page({ searchParams: Promise.resolve(input) }));
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter a few words/)).toBeVisible();
  },
);
it.each([
  { q: ["campus", "private"] },
  { q: "campus", cursor: ["a", "b"] },
  { q: "x".repeat(161) },
  { q: "foo\u0001" },
  { cursor: "token" },
])("rejects ambiguous or malformed inputs before RPC", async (input) => {
  render(await Page({ searchParams: Promise.resolve(input) }));
  expect(read).not.toHaveBeenCalled();
  expect(screen.getByRole("searchbox")).toHaveAttribute("aria-invalid", "true");
});
it("uses safe error feedback and retains bounded query text", async () => {
  read.mockResolvedValue({ kind: "unavailable" });
  render(
    await Page({
      searchParams: Promise.resolve({ q: "<script>alert(1)</script>" }),
    }),
  );
  expect(screen.getByRole("searchbox")).toHaveValue(
    "<script>alert(1)</script>",
  );
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    "Search temporarily unavailable",
  );
  expect(document.querySelector("script")).toBeNull();
});
