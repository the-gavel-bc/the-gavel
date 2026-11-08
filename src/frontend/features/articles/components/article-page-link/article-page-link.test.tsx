import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/link")>()),
  useLinkStatus: () => state,
}));
import { ArticlePageLink } from "./article-page-link";
beforeEach(() => {
  state.pending = false;
});
it("keeps ordinary navigation available when idle", () => {
  render(
    <ArticlePageLink href="/dashboard?cursor=next">Next page</ArticlePageLink>,
  );
  expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
    "href",
    "/dashboard?cursor=next",
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("announces a pending client navigation", () => {
  state.pending = true;
  render(
    <ArticlePageLink href="/dashboard?cursor=next">Next page</ArticlePageLink>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading your articles");
});
