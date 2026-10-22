import { describe, expect, it } from "vitest";
import {
  checkDraftInput,
  draftJsonbByteLength,
  isValidDraftDocument,
  isValidDraftLink,
} from "./draft-contract";
import {
  baseDraft,
  literalCases,
  boundaryCases,
  body,
} from "./draft-test-cases";

describe("draft contract", () => {
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
