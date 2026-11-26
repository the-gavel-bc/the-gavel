import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ArticleBody } from "./article-body";
const document = (content: unknown[], version = 1) => ({
  format: "gavel-draft",
  version,
  document: { type: "doc", content },
});
const text = {
  type: "paragraph",
  content: [{ type: "text", text: "A <story>" }],
};
it("renders semantic canonical text marks lists and quotes without raw HTML", () => {
  const value = document([
    text,
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Section" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Marked",
          marks: [
            { type: "bold" },
            { type: "italic" },
            { type: "link", attrs: { href: "https://example.com/story" } },
          ],
        },
        { type: "hardBreak" },
      ],
    },
    { type: "blockquote", content: [text] },
    { type: "bulletList", content: [{ type: "listItem", content: [text] }] },
    {
      type: "orderedList",
      attrs: { start: 4 },
      content: [{ type: "listItem", content: [text] }],
    },
  ]);
  const html = renderToStaticMarkup(<ArticleBody content={value} />);
  expect(html).toContain("A &lt;story&gt;");
  expect(html).toContain("<strong>");
  expect(html).toContain("<em>");
  expect(html).toContain("<blockquote>");
  expect(html).toContain('start="4"');
  expect(html).toContain('rel="noopener noreferrer nofollow"');
});
it("rejects malicious or unsupported content without rendering partial text", () => {
  for (const node of [
    { ...text, onclick: "alert(1)" },
    { type: "video", attrs: { src: "https://evil.example" } },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "secret",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "secret",
          marks: [{ type: "link", attrs: { href: "data:text/html,bad" } }],
        },
      ],
    },
  ]) {
    const html = renderToStaticMarkup(
      <ArticleBody content={document([text, node])} />,
    );
    expect(html).not.toContain("A &lt;story&gt;");
    expect(html).not.toContain("secret");
    expect(html).toContain("Article content is unavailable.");
  }
});
it("fails safely for cyclic oversized deep and unsupported documents", () => {
  const cyclic: unknown[] = [];
  cyclic.push(cyclic);
  let deep: unknown = text;
  for (let i = 0; i < 20; i++) deep = { type: "blockquote", content: [deep] };
  for (const value of [
    document([deep]),
    document(Array(5001).fill(text)),
    document([
      {
        type: "paragraph",
        content: [{ type: "text", text: "x".repeat(1048577) }],
      },
    ]),
    document(cyclic),
    document([text], 99),
  ]) {
    expect(renderToStaticMarkup(<ArticleBody content={value} />)).toContain(
      "Article content is unavailable.",
    );
  }
});
it("does not accept arbitrary resolver URLs or partial unresolved media", () => {
  const image = {
    type: "image",
    attrs: {
      assetId: "61000000-0000-0000-0000-000000000001",
      alt: "Campus",
      caption: "Caption",
    },
  };
  for (const resolveImage of [
    () => null,
    () => ({ src: "https://evil.example/image.webp", width: 8, height: 6 }),
  ]) {
    const html = renderToStaticMarkup(
      <ArticleBody
        content={document([text, image], 2)}
        resolveImage={resolveImage}
      />,
    );
    expect(html).not.toContain("A &lt;story&gt;");
    expect(html).not.toContain("evil.example");
  }
});
it("shows a plain description when no media resolver was supplied", () => {
  render(
    <ArticleBody
      content={document(
        [
          {
            type: "image",
            attrs: {
              assetId: "61000000-0000-0000-0000-000000000001",
              alt: "Campus",
              caption: "Caption",
            },
          },
        ],
        2,
      )}
    />,
  );
  expect(screen.getByText("Image: Campus")).toBeVisible();
  expect(screen.getByText("Caption")).toBeVisible();
});

it("shows the caption then the credit, and never shows the file name", () => {
  const { container } = render(
    <ArticleBody
      content={document(
        [
          {
            type: "image",
            attrs: {
              assetId: "61000000-0000-0000-0000-000000000001",
              alt: "Students on the quad",
              caption: "The rally drew hundreds.",
              credit: "Jane Doe",
              name: "IMG_2041.jpg",
            },
          },
        ],
        2,
      )}
    />,
  );
  expect(container.querySelector("figcaption")?.textContent).toBe(
    "The rally drew hundreds. Photo: Jane Doe",
  );
  expect(container.textContent).not.toContain("IMG_2041");
});

it("hides a caption that repeats the alt text from screen readers only", () => {
  const { container } = render(
    <ArticleBody
      content={document(
        [
          {
            type: "image",
            attrs: {
              assetId: "61000000-0000-0000-0000-000000000001",
              alt: "Campus",
              caption: "Campus",
              credit: "Staff",
            },
          },
        ],
        2,
      )}
    />,
  );
  const caption = screen.getByText("Campus", { selector: "span" });
  expect(caption).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText("Photo: Staff")).not.toHaveAttribute("aria-hidden");
  expect(container.querySelector("figcaption")).not.toHaveAttribute(
    "aria-hidden",
  );
});
