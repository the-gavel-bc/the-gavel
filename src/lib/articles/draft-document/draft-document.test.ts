import { expect, it } from "vitest";
import { toEditorDocument, fromEditorDocument } from "./draft-document";
import type { DraftDocument } from "../../../shared/articles/draft-contract/draft-contract";
const document = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Link",
          marks: [{ type: "link", attrs: { href: "https://example.org" } }],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 2 },
      content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
    },
  ],
};
const body = { format: "gavel-draft", version: 1, document } as const;
it("loads NULL as an editable empty paragraph without emitting a stored body", () => {
  expect(toEditorDocument(null)).toEqual({
    ok: true,
    document: { type: "doc", content: [{ type: "paragraph" }] },
  });
});
it("round-trips a version 2 image block without a source URL", () => {
  const image = {
    type: "image",
    attrs: {
      assetId: "60000000-0000-0000-0000-000000000701",
      alt: "A photo",
      caption: "On campus",
    },
  };
  const canonical: DraftDocument = {
    format: "gavel-draft",
    version: 2,
    document: {
      type: "doc",
      content: [
        { type: "paragraph" },
        image as DraftDocument["document"]["content"][number],
      ],
    },
  };
  const editor = toEditorDocument(canonical);
  expect(editor).toEqual({ ok: true, document: canonical.document });
  expect(editor.ok && fromEditorDocument(editor.document)).toEqual({
    ok: true,
    document: canonical,
  });
});
it("maps only verified native defaults and leaves its input untouched", () => {
  const native = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {},
        content: [
          {
            type: "text",
            text: "Link",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://example.org",
                  target: "_blank",
                  rel: "noopener noreferrer nofollow",
                  class: null,
                },
              },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 2, type: null },
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      },
    ],
  };
  const before = JSON.stringify(native);
  expect(fromEditorDocument(native)).toEqual({ ok: true, document: body });
  expect(JSON.stringify(native)).toBe(before);
});
it.each([
  { type: "doc", content: [{ type: "paragraph", attrs: [] }] },
  {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "x",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://example.org",
                  title: "Meaningful title",
                },
              },
            ],
          },
        ],
      },
    ],
  },
  { type: "doc", content: [] },
  {
    type: "doc",
    content: [{ type: "paragraph", attrs: { style: "color:red" } }],
  },
  {
    type: "doc",
    content: [
      { type: "orderedList", attrs: { start: 1, type: "A" }, content: [] },
    ],
  },
  {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "x",
            marks: [
              {
                type: "link",
                attrs: { href: "https://example.org", target: "_self" },
              },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "x",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
        ],
      },
    ],
  },
  {
    type: "doc",
    content: [{ type: "image", attrs: { src: "https://example.org/x" } }],
  },
])(
  "rejects unsupported/unsafe native content rather than dropping it",
  (native) => {
    expect(fromEditorDocument(native).ok).toBe(false);
  },
);
it("rejects unknown stored versions and mutable cyclic imports", () => {
  expect(toEditorDocument({ ...body, version: 3 } as never)).toEqual({
    ok: false,
    code: "unsupported_content",
  });
  const cycle: unknown[] = [];
  cycle.push(cycle);
  expect(fromEditorDocument(cycle)).toEqual({
    ok: false,
    code: "invalid_input",
  });
});
