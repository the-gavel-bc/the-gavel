vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  context: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/backend/public-articles/public-article/public-article", () => ({
  getPublicArticleForRequest: mocks.read,
}));
vi.mock("@/backend/public-articles/article-context/article-context", () => ({
  getArticleContext: mocks.context,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
import Page, { generateMetadata } from "./page";
import NotFound from "./not-found";
import ErrorPage from "./error";
const params = Promise.resolve({ slug: "public-story" });
const article = {
  id: "53000000-0000-0000-0000-000000000035",
  slug: "public-story",
  title: "A public story",
  excerpt: "The introduction",
  metaDescription: "Search description",
  publishedAt: "2026-11-09T00:00:00Z",
  content: {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Readable public body" }],
        },
      ],
    },
  },
  section: { id: "section", name: "News", slug: "news" },
  owner: {
    displayName: "Owner Name",
    slug: "owner-name",
    biography: "Public biography\nAnother paragraph",
  },
  categories: [{ id: "category", name: "Campus", slug: "campus" }],
  tags: [{ id: "tag", name: "Student life", slug: "student-life" }],
  contributors: [
    {
      displayName: "Writer Name",
      slug: "writer-name",
      role: "writer",
      displayOrder: 0,
    },
    {
      displayName: "Editor Name",
      slug: "editor-name",
      role: "editor",
      displayOrder: 0,
    },
    {
      displayName: "Creative Name",
      slug: "creative-name",
      role: "creative",
      displayOrder: 0,
    },
  ],
  mainImage: {
    id: "63000000-0000-0000-0000-000000000035",
    width: 800,
    height: 600,
    alt: "Campus scene",
    credit: "Photographer",
    caption: null,
  },
  bodyImages: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue([]);
  mocks.read.mockResolvedValue({ kind: "ok", article });
});
it("resolves missing, draft and archived projections with notFound before reading related content", async () => {
  mocks.read.mockResolvedValue({ kind: "notFound" });
  await expect(Page({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  await expect(generateMetadata({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.context).not.toHaveBeenCalled();
});
it("renders generic unavailable output and noindex metadata on rejected content or service failure", async () => {
  mocks.read.mockResolvedValue({ kind: "unavailable" });
  render(await Page({ params }));
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: "Article temporarily unavailable",
    }),
  ).toBeVisible();
  expect(screen.queryByText(article.title)).not.toBeInTheDocument();
  expect(await generateMetadata({ params })).toMatchObject({
    robots: { index: false, follow: false },
  });
  expect(mocks.context).not.toHaveBeenCalled();
});
it("renders semantic article, attribution, authorized media, safe body and scoped taxonomy links", async () => {
  render(await Page({ params }));
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    article.title,
  );
  for (const text of [
    article.excerpt,
    "Readable public body",
    "Written by",
    "Edited by",
    "Creative contributors",
    "Photo: Photographer",
  ])
    expect(screen.getByText(text)).toBeVisible();
  expect(screen.queryByText("Article owner")).not.toBeInTheDocument();
  for (const person of article.contributors)
    expect(
      screen.getAllByRole("link", { name: person.displayName })[0],
    ).toHaveAttribute("href", `/authors/${person.slug}`);
  expect(screen.getByRole("link", { name: "Campus" })).toHaveAttribute(
    "href",
    "/sections/news/categories/campus",
  );
  expect(screen.getByRole("link", { name: "Student life" })).toHaveAttribute(
    "href",
    "/tags/student-life",
  );
  expect(screen.getByText("Public biography", { exact: false })).toBeVisible();
  const image = screen.getByRole("img", { name: "Campus scene" });
  expect(image).toHaveAttribute(
    "src",
    `/api/public/articles/${article.id}/media/${article.mainImage.id}`,
  );
  expect(image).toHaveAttribute("width", "800");
  expect(image).toHaveAttribute("loading", "eager");
  expect(image).toHaveAttribute("fetchpriority", "high");
  expect(document.querySelector("time")).toHaveAttribute(
    "datetime",
    article.publishedAt,
  );
  expect(await generateMetadata({ params })).toMatchObject({
    title: article.title,
    description: article.metaDescription,
  });
  expect(mocks.context).toHaveBeenCalledWith(article.id, "news");
});
it("omits empty optional groups rather than fabricating a byline, biography or image", async () => {
  mocks.read.mockResolvedValue({
    kind: "ok",
    article: {
      ...article,
      excerpt: null,
      mainImage: null,
      contributors: [],
      categories: [],
      tags: [],
      owner: { ...article.owner, biography: null },
    },
  });
  render(await Page({ params }));
  expect(screen.queryByText("Written by")).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: /About Owner/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Keep reading" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Search stories" }),
  ).not.toBeInTheDocument();
});
it("offers safe not-found and unexpected-error recovery", () => {
  const { unmount } = render(<NotFound />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Article not found",
  );
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
    "href",
    "/",
  );
  unmount();
  const reset = vi.fn();
  render(<ErrorPage error={new Error("private diagnostic")} reset={reset} />);
  expect(screen.queryByText("private diagnostic")).not.toBeInTheDocument();
  screen.getByRole("button", { name: "Try again" }).click();
  expect(reset).toHaveBeenCalledOnce();
});

it("shows bounded related links independently from the article and uses excerpt metadata fallback", async () => {
  mocks.read.mockResolvedValue({
    kind: "ok",
    article: { ...article, metaDescription: null },
  });
  mocks.context.mockResolvedValue([
    {
      id: "53000000-0000-0000-0000-000000000036",
      slug: "related-story",
      title: "A related story",
      excerpt: null,
      publishedAt: article.publishedAt,
      section: article.section,
      owner: article.owner,
      writers: [],
      mainImage: null,
    },
  ]);
  render(await Page({ params }));
  expect(
    screen.getByRole("complementary", { name: "Keep reading" }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "A related story" })).toHaveAttribute(
    "href",
    "/articles/related-story",
  );
  expect(await generateMetadata({ params })).toMatchObject({
    title: article.title,
    description: article.excerpt,
  });
});

it("canonical metadata uses the stored public slug and authorized media route", async () => {
  const result = await generateMetadata({ params });
  expect(result.alternates?.canonical).toBe(
    "https://gavel.example/articles/public-story",
  );
  expect(result.openGraph).toMatchObject({
    type: "article",
    images: [
      {
        url: `https://gavel.example/api/public/articles/${article.id}/media/${article.mainImage.id}`,
      },
    ],
  });
});

it("renders the optional main photo caption before its credit as safe text", async () => {
  mocks.read.mockResolvedValue({
    kind: "ok",
    article: {
      ...article,
      mainImage: {
        ...article.mainImage,
        caption: "<script>Caption text</script>",
      },
    },
  });
  render(await Page({ params }));
  expect(document.querySelector("figcaption")).toHaveTextContent(
    "<script>Caption text</script> Photo: Photographer",
  );
  expect(document.querySelector("article script")).toBeNull();
});
