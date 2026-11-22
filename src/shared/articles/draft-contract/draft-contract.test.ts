import { describe, expect, it } from "vitest";
import {
  checkDraftInput,
  draftJsonbByteLength,
  isValidDraftDocument,
  isValidDraftLink,
  checkDraftStructure,
} from "./draft-contract";
import {
  baseDraft,
  literalCases,
  boundaryCases,
  body,
} from "./draft-test-cases";

describe("draft contract", () => {
  it("accepts only bounded canonical version 2 body images", () => {
    const assetId = "20000000-0000-0000-0000-000000000001";
    const image = {
      type: "image",
      attrs: { assetId, alt: "A photo", caption: null },
    };
    const version2 = (blocks: unknown[]) => ({
      format: "gavel-draft",
      version: 2,
      document: { type: "doc", content: blocks },
    });
    expect(isValidDraftDocument(version2([image]))).toBe(true);
    expect(
      checkDraftInput({ ...baseDraft, content: version2([image]) }).ok,
    ).toBe(true);
    expect(
      isValidDraftDocument(
        version2([
          { ...image, attrs: { ...image.attrs, caption: "a".repeat(501) } },
        ]),
      ),
    ).toBe(false);
    expect(
      isValidDraftDocument(
        version2([{ ...image, attrs: { ...image.attrs, alt: " " } }]),
      ),
    ).toBe(false);
    expect(
      isValidDraftDocument(
        version2([
          {
            ...image,
            attrs: { ...image.attrs, src: "https://evil.example/x" },
          },
        ]),
      ),
    ).toBe(false);
    expect(isValidDraftDocument(version2([image, image]))).toBe(false);
    expect(isValidDraftDocument({ ...version2([image]), version: 1 })).toBe(
      false,
    );
  });
  it("rejects a caller-selected slug in a draft payload", () => {
    expect(checkDraftInput({ ...baseDraft, slug: "chosen-path" })).toEqual({
      ok: false,
      code: "invalid_input",
    });
  });
  for (const c of [...literalCases, ...boundaryCases()])
    it(c.name, () => {
      if (c.target === "link") {
        expect(isValidDraftLink(c.value)).toBe(c.want === "ok");
        expect(
          isValidDraftDocument({
            format: "gavel-draft",
            version: 1,
            document: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "link",
                      marks: [{ type: "link", attrs: { href: c.value } }],
                    },
                  ],
                },
              ],
            },
          }),
        ).toBe(c.want === "ok");
      } else if (c.target === "content") {
        expect(isValidDraftDocument(c.value)).toBe(c.want === "ok");
        const result = checkDraftInput({ ...baseDraft, content: c.value });
        expect(result.ok ? "ok" : result.code).toBe(c.want);
      } else {
        const result = checkDraftInput(c.value);
        expect(result.ok ? "ok" : result.code).toBe(c.want);
      }
    });
  it("sorts selection IDs without mutating the input", () => {
    const value = {
      ...baseDraft,
      categoryIds: [
        "20000000-0000-0000-0000-000000000002",
        baseDraft.sectionId,
      ],
    };
    const result = checkDraftInput(value);
    expect(result.ok && result.value.categoryIds).toEqual([
      baseDraft.sectionId,
      "20000000-0000-0000-0000-000000000002",
    ]);
    expect(value.categoryIds[0]).toBe("20000000-0000-0000-0000-000000000002");
  });
  it("counts PostgreSQL JSONB spaces and UTF-8 escapes", () => {
    expect(draftJsonbByteLength({ a: "é", b: [1, null] })).toBe(27);
    expect(draftJsonbByteLength(body(""))).toBe(147);
    expect(draftJsonbByteLength({ x: '\b\t\n\f\r\u0001"\\' })).toBe(29);
  });
  it("bounds serialized input at 1,100,000 bytes", () => {
    expect(draftJsonbByteLength({ padding: "a".repeat(1099985) })).toBe(
      1100000,
    );
    expect(draftJsonbByteLength({ padding: "a".repeat(1099986) })).toBeNull();
  });
  it("rejects non-JSON and invalid storage Unicode without throwing", () => {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    for (const value of [
      undefined,
      NaN,
      Infinity,
      1.5,
      BigInt(1),
      () => null,
      cycle,
      { a: undefined },
      { a: "\u0000" },
      { a: "\ud800" },
      { a: "\udc00" },
      new Date(),
    ]) {
      expect(draftJsonbByteLength(value)).toBeNull();
      expect(checkDraftInput(value).ok).toBe(false);
    }
  });
  it("rejects duplicate profile-role credits but allows distinct roles and tied orders", () => {
    const c = {
      profileId: baseDraft.sectionId,
      role: "writer",
      displayOrder: 0,
    };
    expect(checkDraftInput({ ...baseDraft, contributors: [c, c] }).ok).toBe(
      false,
    );
    expect(
      checkDraftInput({
        ...baseDraft,
        contributors: [c, { ...c, role: "editor" }],
      }).ok,
    ).toBe(true);
  });
  it("counts supplementary characters as PostgreSQL characters", () => {
    expect(checkDraftInput({ ...baseDraft, title: "😀".repeat(240) }).ok).toBe(
      true,
    );
    expect(checkDraftInput({ ...baseDraft, title: "😀".repeat(241) }).ok).toBe(
      false,
    );
  });
});

describe("publication date in the draft input", () => {
  it("accepts a real date and keeps it in the canonical value", () => {
    const result = checkDraftInput({
      ...baseDraft,
      publicationDate: "2026-01-15",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { publicationDate: "2026-01-15" },
    });
  });
  it("treats absent and null alike and strips the key so older fingerprints still match", () => {
    for (const draft of [baseDraft, { ...baseDraft, publicationDate: null }]) {
      const result = checkDraftInput(draft);
      expect(result.ok).toBe(true);
      if (result.ok) expect("publicationDate" in result.value).toBe(false);
    }
  });
  it("refuses an impossible, malformed or non-string date and never loosens other keys", () => {
    for (const publicationDate of ["2026-02-30", "01/15/2026", 20260115, ""])
      expect(checkDraftInput({ ...baseDraft, publicationDate }).ok).toBe(false);
    expect(checkDraftInput({ ...baseDraft, extra: true }).ok).toBe(false);
  });
});

it.each(["\u202E", "\u001C"])(
  "rejects unsafe draft text on writes and preserves stored text on reads",
  (character) => {
    const title = `News${character}room`;
    const content = {
      format: "gavel-draft",
      version: 2,
      document: {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              assetId: "20000000-0000-0000-0000-000000000001",
              alt: `A${character} photo`,
              caption: `Campus${character} news`,
            },
          },
        ],
      },
    };
    expect(checkDraftInput({ ...baseDraft, title }).ok).toBe(false);
    expect(checkDraftInput({ ...baseDraft, content }).ok).toBe(false);
    expect(isValidDraftDocument(content)).toBe(true);
    expect(checkDraftStructure({ ...baseDraft, title, content })).toMatchObject(
      {
        ok: true,
        value: { title, content },
      },
    );
  },
);
