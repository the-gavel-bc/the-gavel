vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  resolve: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error("NEXT_REDIRECT " + href);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/backend/public-articles/public-archive/public-archive", () => ({
  getPublicArchiveForRequest: mocks.read,
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@/backend/taxonomy/taxonomy-redirect/taxonomy-redirect", () => ({
  resolveTaxonomyRedirect: mocks.resolve,
}));
import Section, {
  generateMetadata as sectionMetadata,
} from "./[sectionSlug]/page";
import Category, {
  generateMetadata as categoryMetadata,
} from "./[sectionSlug]/categories/[categorySlug]/page";
import Letters, { generateMetadata as lettersMetadata } from "../letters/page";
const section = { name: "News", slug: "news", categories: [] };
const archive = {
  title: "News",
  section,
  category: null,
  href: "/sections/news",
  isLetters: false,
};
const sectionProps = {
  params: Promise.resolve({ sectionSlug: "news" }),
  searchParams: Promise.resolve({ cursor: "token" }),
};
const categoryProps = {
  params: Promise.resolve({ sectionSlug: "sports", categorySlug: "campus" }),
  searchParams: Promise.resolve({}),
};
const lettersProps = {
  params: Promise.resolve({}),
  searchParams: Promise.resolve({}),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue(null);
  mocks.read.mockResolvedValue({
    kind: "ok",
    archive,
    items: [],
    nextCursor: null,
    continuation: false,
  });
});
it("passes section/category/letters route inputs into the checked resolver", async () => {
  render(await Section(sectionProps));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("News");
  expect(mocks.read).toHaveBeenLastCalledWith("section", "news", "", "token");
  await Category(categoryProps);
  expect(mocks.read).toHaveBeenLastCalledWith(
    "category",
    "sports",
    "campus",
    undefined,
  );
  await Letters(lettersProps);
  expect(mocks.read).toHaveBeenLastCalledWith("letters", "", "", undefined);
});
it("invokes notFound for missing active scope in both page and metadata", async () => {
  mocks.read.mockResolvedValue({ kind: "notFound" });
  for (const render of [
    () => Section(sectionProps),
    () => Category(categoryProps),
    () => Letters(lettersProps),
    () => sectionMetadata(sectionProps),
    () => categoryMetadata(categoryProps),
    () => lettersMetadata(lettersProps),
  ])
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
});
it("returns safe non-indexed metadata for unavailable and invalid pages", async () => {
  mocks.read.mockResolvedValue({ kind: "unavailable" });
  for (const metadata of [
    () => sectionMetadata(sectionProps),
    () => categoryMetadata(categoryProps),
    () => lettersMetadata(lettersProps),
  ])
    expect(await metadata()).toMatchObject({
      robots: { index: false, follow: false },
    });
  mocks.read.mockResolvedValue({ kind: "invalid", archive });
  expect(await sectionMetadata(sectionProps)).toMatchObject({
    title: "News",
    robots: { index: false, follow: false },
  });
  mocks.read.mockResolvedValue({
    kind: "ok",
    archive,
    items: [],
    nextCursor: null,
    continuation: false,
  });
  expect(await sectionMetadata(sectionProps)).toMatchObject({ title: "News" });
});

it("forwards the letters cursor and excludes continuation pages from indexing", async () => {
  mocks.read.mockResolvedValue({
    kind: "ok",
    archive: {
      ...archive,
      title: "Letter to the Editor",
      href: "/letters",
      isLetters: true,
    },
    items: [],
    nextCursor: null,
    continuation: true,
  });
  const props = {
    ...lettersProps,
    searchParams: Promise.resolve({ cursor: "letters-next" }),
  };
  render(await Letters(props));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Letter to the Editor",
  );
  expect(mocks.read).toHaveBeenLastCalledWith(
    "letters",
    "",
    "",
    "letters-next",
  );
  expect(await lettersMetadata(props)).toMatchObject({
    robots: { index: false, follow: true },
  });
});

it("redirects retired section and category paths", async () => {
  mocks.read.mockResolvedValue({ kind: "notFound" });
  mocks.resolve
    .mockResolvedValueOnce("/letters")
    .mockResolvedValueOnce("/sections/sports");
  await expect(Section(sectionProps)).rejects.toThrow("NEXT_REDIRECT /letters");
  await expect(categoryMetadata(categoryProps)).rejects.toThrow(
    "NEXT_REDIRECT /sections/sports",
  );
  expect(mocks.resolve.mock.calls).toEqual([
    ["/sections/news"],
    ["/sections/sports/categories/campus"],
  ]);
});
