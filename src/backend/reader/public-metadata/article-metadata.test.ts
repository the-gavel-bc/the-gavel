import { expect, it, vi } from "vitest";
vi.mock("@/backend/infrastructure/env/server/server", () => ({
  getServerEnv: () => ({ SITE_URL: "https://gavel.example" }),
}));
import { publicArticleMetadata } from "./public-metadata";
import type { PublicArticle } from "@/backend/public-articles/public-article/public-article";
const article: PublicArticle = {
  id: "53000000-0000-0000-0000-000000000035",
  slug: "frozen-story",
  title: 'Title " & <literal>',
  excerpt: "Excerpt",
  metaDescription: "Preferred\n  description",
  publishedAt: "2026-11-09T00:00:00.123456Z",
  content: {
    format: "gavel-draft",
    version: 1,
    document: { type: "doc", content: [] },
  },
  section: {
    id: "23000000-0000-0000-0000-000000000035",
    name: "News",
    slug: "news",
  },
  owner: { displayName: "Owner", slug: "frozen-author", biography: null },
  contributors: [],
  categories: [],
  tags: [],
  mainImage: {
    id: "63000000-0000-0000-0000-000000000035",
    width: 800,
    height: 600,
    alt: "Campus",
    credit: "Photographer",
    caption: null,
  },
  bodyImages: [],
};
it("uses stored article slug, current public image path and public authors only", () => {
  const result = publicArticleMetadata({
    ...article,
    contributors: [
      {
        displayName: "Writer",
        slug: "writer",
        role: "writer",
        displayOrder: 0,
      },
      {
        displayName: "Editor",
        slug: "editor",
        role: "editor",
        displayOrder: 0,
      },
    ],
  });
  expect(result.alternates?.canonical).toBe(
    "https://gavel.example/articles/frozen-story",
  );
  expect(result.description).toBe("Preferred description");
  expect(result.openGraph).toMatchObject({
    type: "article",
    publishedTime: article.publishedAt,
    authors: [
      "https://gavel.example/authors/frozen-author",
      "https://gavel.example/authors/writer",
    ],
    images: [
      {
        url: `https://gavel.example/api/public/articles/${article.id}/media/${article.mainImage!.id}`,
        width: 800,
        height: 600,
        alt: "Campus",
      },
    ],
  });
  expect(JSON.stringify(result)).not.toMatch(/storage|service_role|auth_user/);
});
it("falls back to excerpt and text summary without inventing media", () => {
  const result = publicArticleMetadata({
    ...article,
    metaDescription: "  ",
    mainImage: null,
  });
  expect(result.description).toBe("Excerpt");
  expect(result.twitter).toMatchObject({ card: "summary", images: [] });
  expect(result.openGraph).toMatchObject({ images: [] });
});
it("never reads a body to generate a fallback description", () => {
  const input = { ...article, metaDescription: null, excerpt: null };
  Object.defineProperty(input, "content", {
    get: () => {
      throw new Error("Body must not be read");
    },
  });
  expect(publicArticleMetadata(input).description).toBe(
    "Independent student journalism at Boston College.",
  );
});
