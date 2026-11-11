import { expect, it } from "vitest";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
import type { DraftDocument } from "@/shared/articles/draft-contract/draft-contract";
import {
  draftContentKey,
  draftInputKey,
  draftInputKeyWithContentKey,
} from "./draft-input-key";

it("recomputes general mutable inputs rather than caching object references", () => {
  const content: DraftDocument = {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      ],
    },
  };
  const input = { ...baseDraft, content };
  const before = draftInputKey(input);
  content.document.content.push({
    type: "paragraph",
    content: [{ type: "text", text: "After" }],
  });
  expect(draftInputKey(input)).not.toBe(before);
});

it("retains the canonical JSON key with a reusable body key", () => {
  const input = {
    ...baseDraft,
    sectionId: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
    categoryIds: ["b", "A"],
    tagIds: ["D", "c"],
    contributors: [
      { profileId: "B", role: "writer" as const, displayOrder: 0 },
      { profileId: "A", role: "editor" as const, displayOrder: 1 },
    ],
  };
  const expected = JSON.stringify(
    {
      ...input,
      sectionId: input.sectionId.toLowerCase(),
      categoryIds: ["a", "b"],
      tagIds: ["c", "d"],
      contributors: [
        { profileId: "a", role: "editor", displayOrder: 1 },
        { profileId: "b", role: "writer", displayOrder: 0 },
      ],
    },
    (_, value: unknown) =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
          )
        : value,
  );
  expect(draftInputKey(input)).toBe(expected);
  expect(
    draftInputKeyWithContentKey(input, draftContentKey(input.content)),
  ).toBe(expected);
});

it("ignores body object-key order but preserves body array order", () => {
  const content: DraftDocument = {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "One" }] },
        { type: "paragraph", content: [{ type: "text", text: "Two" }] },
      ],
    },
  };
  const input = { ...baseDraft, content };
  expect(
    draftInputKey({
      ...input,
      content: {
        document: content.document,
        version: 1,
        format: "gavel-draft",
      },
    }),
  ).toBe(draftInputKey(input));
  expect(
    draftInputKey({
      ...input,
      content: {
        ...content,
        document: {
          ...content.document,
          content: [...content.document.content].reverse(),
        },
      },
    }),
  ).not.toBe(draftInputKey(input));
});
