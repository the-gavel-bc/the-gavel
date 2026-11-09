import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({
    createPublicReaderClient: () => ({ rpc: mocks.rpc }),
  }),
);

import { getPublicArticle } from "./public-article";

const article = {
  id: "53000000-0000-0000-0000-000000000035",
  slug: "public-story",
  title: "Public story",
  excerpt: null,
  metaDescription: null,
  publishedAt: "2026-11-09T00:00:00+00:00",
  content: {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    },
  },
  section: {
    id: "23000000-0000-0000-0000-000000000035",
    name: "News",
    slug: "news",
  },
  owner: { displayName: "Writer", slug: "writer", biography: null },
  categories: [],
  tags: [],
  contributors: [],
  mainImage: null,
  bodyImages: [],
};

describe("getPublicArticle", () => {
  beforeEach(() => vi.resetAllMocks());
  it("returns validated public detail", async () => {
    mocks.rpc.mockResolvedValue({ data: { kind: "ok", article }, error: null });
    expect(await getPublicArticle("public-story")).toEqual({
      kind: "ok",
      article,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_article", {
      p_slug: "public-story",
    });
  });
  it("accepts valid text measured in Unicode code points", async () => {
    const unicodeArticle = {
      ...article,
      title: "😀".repeat(240),
      owner: { ...article.owner, biography: "😀".repeat(5000) },
    };
    mocks.rpc.mockResolvedValue({
      data: { kind: "ok", article: unicodeArticle },
      error: null,
    });
    expect(await getPublicArticle("public-story")).toEqual({
      kind: "ok",
      article: unicodeArticle,
    });
  });
  it("does not call the database for malformed slugs", async () => {
    expect(await getPublicArticle("Invalid slug")).toEqual({
      kind: "notFound",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("hides malformed responses and unexpected fields", async () => {
    mocks.rpc.mockResolvedValue({
      data: { kind: "ok", article: { ...article, object_key: "secret" } },
      error: null,
    });
    expect(await getPublicArticle("public-story")).toEqual({
      kind: "unavailable",
    });
  });
  it("does not return unsupported document content", async () => {
    mocks.rpc.mockResolvedValue({
      data: { kind: "ok", article: { ...article, content: { version: 99 } } },
      error: null,
    });
    expect(await getPublicArticle("public-story")).toEqual({
      kind: "unavailable",
    });
  });
  it("converts errors and thrown exceptions to unavailable", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: new Error("private error") })
      .mockRejectedValueOnce(new Error("private error"));
    expect(await getPublicArticle("public-story")).toEqual({
      kind: "unavailable",
    });
    expect(await getPublicArticle("public-story")).toEqual({
      kind: "unavailable",
    });
  });
});
