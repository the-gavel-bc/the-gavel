import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));
import { SearchResults } from "./search-results";
it("renders instructions without pretending an empty query was searched", () => {
  render(<SearchResults result={{ kind: "prompt" }} query="" />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Search articles",
  );
  expect(screen.queryByText(/No stories/)).toBeNull();
});
it("renders literal empty query text with no injected HTML", () => {
  render(
    <SearchResults
      result={{ kind: "ok", query: '<script>" &', items: [], nextCursor: null }}
      query={'<script>" &'}
    />,
  );
  expect(screen.getByText(/No stories/)).toBeVisible();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    '<script>" &',
  );
  expect(document.querySelector("script")).toBeNull();
});
it("keeps pagination query-bound and prevents speculative quota use", () => {
  render(
    <SearchResults
      result={{
        kind: "ok",
        query: "campus & art",
        items: [],
        nextCursor: "opaque_token",
      }}
      query="campus & art"
      cursor="previous"
    />,
  );
  const next = screen.getByRole("link", { name: "Older articles" });
  const url = new URL(next.getAttribute("href")!, "http://localhost");
  expect(url.searchParams.get("q")).toBe("campus & art");
  expect(url.searchParams.get("cursor")).toBe("opaque_token");
  expect(next).toHaveAttribute("data-prefetch", "false");
  expect(screen.getByRole("link", { name: "Newest results" })).toHaveAttribute(
    "href",
    "/search?q=campus+%26+art",
  );
});
it.each(["invalid", "unavailable", "rate_limited"] as const)(
  "shows safe %s correction/retry feedback",
  (kind) => {
    render(
      <SearchResults
        query="campus"
        cursor="cursor"
        result={kind === "rate_limited" ? { kind, retryAfter: 42 } : { kind }}
      />,
    );
    if (kind === "invalid")
      expect(screen.getByRole("searchbox")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    else
      expect(
        screen.getByRole("link", { name: "Retry search" }),
      ).toHaveAttribute("href", "/search?q=campus&cursor=cursor");
    if (kind === "rate_limited")
      expect(screen.getByText(/42 seconds/)).toBeVisible();
  },
);
