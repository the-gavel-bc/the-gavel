import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(path);
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/articles/article-preview/article-preview", () => ({
  getEditorialArticlePreview: mocks.read,
}));
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import Page, { metadata } from "./page";

const id = "50000000-0000-4000-8000-000000000001";
const asset = "70000000-0000-4000-8000-000000000002";
const params = Promise.resolve({ id });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ status: "active", role: "editor" });
});

it("uses a generic noindex title", () => {
  expect(metadata).toMatchObject({
    title: "Draft preview",
    robots: { index: false, follow: false },
  });
});

it("uses the sign-in route before asking for saved content", async () => {
  mocks.access.mockResolvedValue({ status: "signedOut" });
  await expect(Page({ params })).rejects.toThrow("/sign-in");
  expect(mocks.read).not.toHaveBeenCalled();
});

it("returns the same missing response to authors or when the draft is unreadable", async () => {
  mocks.access.mockResolvedValueOnce({ status: "active", role: "author" });
  await expect(Page({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue({ kind: "notFound" });
  await expect(Page({ params })).rejects.toThrow("NEXT_NOT_FOUND");
});

it("provides a stable way to return if the preview could not load", async () => {
  mocks.read.mockResolvedValue({ kind: "unavailable" });
  render(await Page({ params }));
  expect(
    screen.getByRole("heading", { name: "Draft preview unavailable" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to editor" })).toHaveAttribute(
    "href",
    `/dashboard/articles/${id}`,
  );
});

it("withholds the draft when membership verification fails and preserves the Back link", async () => {
  mocks.access.mockRejectedValue(new Error("Private authorization failure"));
  render(await Page({ params }));
  expect(mocks.read).not.toHaveBeenCalled();
  expect(
    screen.getByRole("heading", { name: "Draft preview unavailable" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to editor" })).toHaveAttribute(
    "href",
    `/dashboard/articles/${id}`,
  );
});

it("keeps readable content visible when a body image is missing", async () => {
  mocks.read.mockResolvedValue({
    kind: "ok",
    dateEstimated: true,
    bodyUnavailable: false,
    mainImageUnavailable: false,
    article: {
      id,
      title: "Private preview",
      publishedAt: "2026-03-08T12:00:00Z",
      excerpt: null,
      section: { id, name: "News", slug: "news" },
      owner: { displayName: "Staff writer", slug: null, biography: null },
      categories: [],
      tags: [{ id, name: "Private topic", slug: "private-topic" }],
      contributors: [],
      bodyImages: [],
      mainImage: {
        id: asset,
        width: 800,
        height: 600,
        alt: "Main photograph",
        credit: "Staff",
        caption: null,
      },
      content: {
        format: "gavel-draft",
        version: 2,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Saved text" }],
            },
            {
              type: "image",
              attrs: {
                assetId: asset,
                alt: "Missing image",
                caption: "Saved caption",
              },
            },
          ],
        },
      },
    },
  });
  render(await Page({ params }));
  expect(
    screen.getByRole("heading", { name: "Private preview" }),
  ).toBeVisible();
  expect(screen.getByText("Saved text")).toBeVisible();
  expect(screen.getByText("Some draft images are unavailable.")).toBeVisible();
  expect(screen.getByText("Saved caption")).toBeVisible();
  expect(screen.getByText("Private topic")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Private topic" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Main photograph" })).toHaveAttribute(
    "src",
    `/api/articles/${id}/media/${asset}`,
  );
});
