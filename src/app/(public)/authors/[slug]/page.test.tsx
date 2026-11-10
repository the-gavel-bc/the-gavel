import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock(
  "@/backend/public-articles/public-author-archive/public-author-archive",
  () => ({ getPublicAuthorArchiveForRequest: mocks.read }),
);
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
import Page, { generateMetadata } from "./page";
const props = {
  params: Promise.resolve({ slug: "guest-writer" }),
  searchParams: Promise.resolve({ cursor: "token" }),
};
const archive = {
  title: "Guest Writer",
  section: null,
  category: null,
  href: "/authors/guest-writer",
  isLetters: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({
    kind: "ok",
    author: {
      displayName: "Guest Writer",
      slug: "guest-writer",
      biography: "Guest public biography",
    },
    archive,
    items: [],
    nextCursor: null,
    continuation: false,
  });
});
it("passes slug and opaque cursor through the request-cached boundary", async () => {
  render(await Page(props));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Guest Writer",
  );
  expect(mocks.read).toHaveBeenCalledWith("guest-writer", "token");
  expect(await generateMetadata(props)).toEqual({ title: "Guest Writer" });
});
it("resolves real notFound before rendering either page or metadata", async () => {
  mocks.read.mockResolvedValue({ kind: "notFound" });
  await expect(Page(props)).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(generateMetadata(props)).rejects.toThrow("NEXT_NOT_FOUND");
});
it("does not index invalid cursor or unavailable service states", async () => {
  mocks.read.mockResolvedValue({
    kind: "invalid",
    author: {
      displayName: "Guest Writer",
      slug: "guest-writer",
      biography: null,
    },
    archive,
  });
  expect(await generateMetadata(props)).toMatchObject({
    robots: { index: false, follow: false },
  });
  mocks.read.mockResolvedValue({ kind: "unavailable" });
  expect(await generateMetadata(props)).toMatchObject({
    robots: { index: false, follow: false },
  });
  render(await Page(props));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Archive temporarily unavailable",
  );
});
