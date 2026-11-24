import { describe, expect, it } from "vitest";
import {
  isValidDraftDocument,
  isValidDraftLink,
} from "@/shared/articles/draft-contract/draft-contract";
import map from "./taxonomy-map.json";
import {
  altText,
  isImportableLink,
  mapTaxonomy,
  toDocument,
  toPayload,
} from "./convert.mjs";
import { demoImagePath } from "./export.mjs";

const article = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "story",
  section: "news",
  title: "  A story  ",
  excerpt: "",
  body: "First [link](https://example.com/a) here.\nSecond line.\n\n## Heading\n\nBad [mail](mailto:x@bc.edu) link.",
  image_alt: null,
  image_caption: null,
  image_credit: "Photographer",
  correction: null,
  author_name: "Jane Writer",
  status: "published",
  featured: false,
  published_at: "2026-03-04T15:00:00Z",
  content_updated_at: null,
  categories: [{ name: "National", slug: "national", section: "news" }],
  tags: [
    { name: "Politics", slug: "politics" },
    { name: "politics", slug: "politics-2" },
  ],
};

describe("toDocument", () => {
  it("builds paragraphs, headings, line breaks and links the editor accepts", () => {
    const { content, droppedLinks } = toDocument(article.body);
    expect(isValidDraftDocument(content)).toBe(true);
    expect(droppedLinks).toBe(1);
    const [first, heading, last] = content.document.content;
    expect(first.content.map((node) => node.type)).toEqual([
      "text",
      "text",
      "text",
      "hardBreak",
      "text",
    ]);
    expect(first.content[1].marks).toEqual([
      { type: "link", attrs: { href: "https://example.com/a" } },
    ]);
    expect(heading).toEqual({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Heading" }],
    });
    expect(last.content.map((node) => node.text).join("")).toBe(
      "Bad mail link.",
    );
  });
  it("returns no content for an empty body and removes control characters", () => {
    expect(toDocument(" \n\n ").content).toBeNull();
    expect(
      toDocument("a\u0007b‮c").content.document.content[0].content[0].text,
    ).toBe("abc");
  });
});

describe("isImportableLink", () => {
  it.each([
    "https://www.nytimes.com/2026/a.html",
    "http://example.com",
    "javascript:alert(1)",
    "mailto:x@bc.edu",
    "https://user@example.com",
    "https://xn--80ak6aa92e.com",
    "https://127.0.0.1/x",
    "https://exa mple.com",
  ])("never keeps a link the editor would refuse: %s", (href) => {
    if (isImportableLink(href)) expect(isValidDraftLink(href)).toBe(true);
  });
});

describe("mapping", () => {
  it("maps a demo category and stops on an unmapped one", () => {
    expect(mapTaxonomy(article, map)).toEqual({
      ok: true,
      section: "features",
      categories: ["outside-of-bc"],
    });
    expect(
      mapTaxonomy({ ...article, categories: [{ slug: "unknown" }] }, map),
    ).toEqual({
      ok: false,
      reason: "no mapping for news/unknown",
    });
  });
  it("sends letters to the letters section with no category", () => {
    expect(
      mapTaxonomy(
        {
          ...article,
          section: "opinions",
          categories: [{ slug: "letter-to-the-editor" }],
        },
        map,
      ),
    ).toEqual({ ok: true, section: "letter-to-the-editor", categories: [] });
  });
});

describe("toPayload", () => {
  it("trims text, drops empty excerpts and duplicate tags", () => {
    const result = toPayload(article, map);
    expect(result.ok).toBe(true);
    expect(result.payload).toMatchObject({
      title: "A story",
      excerpt: null,
      writer: "Jane Writer",
      tags: ["Politics"],
      status: "published",
      correction: null,
    });
  });
  it("refuses a published article without a body", () => {
    expect(toPayload({ ...article, body: "" }, map)).toEqual({
      ok: false,
      reason: "published article has an empty body",
    });
  });
  it("uses the approved alt text fallback", () => {
    expect(altText(article)).toBe("Photo for A story");
    expect(altText({ ...article, image_caption: "Caption" })).toBe("Caption");
  });
});

it("only fetches images from the demo project's public bucket", () => {
  const demo = "https://demo.supabase.co";
  expect(
    demoImagePath(
      `${demo}/storage/v1/object/public/article-images/a/b.jpg`,
      demo,
    ),
  ).toBe("a/b.jpg");
  expect(
    demoImagePath(
      "https://evil.test/storage/v1/object/public/article-images/a.jpg",
      demo,
    ),
  ).toBeNull();
  expect(
    demoImagePath(`${demo}/storage/v1/object/public/other/a.jpg`, demo),
  ).toBeNull();
});
