import { expect, it } from "vitest";
import { draftMetadataErrors } from "./draft-contract";
import { baseDraft } from "./draft-test-cases";
it("shares field feedback with the authoritative metadata rules", () => {
  expect(draftMetadataErrors(baseDraft)).toEqual({});
  expect(
    draftMetadataErrors({
      ...baseDraft,
      title: "",
      slug: "Upper Case",
      sectionId: "",
    }),
  ).toMatchObject({
    title: expect.any(String),
    slug: expect.any(String),
    sectionId: expect.any(String),
  });
});
it.each(["excerpt", "seoKeyphrase", "metaDescription"])(
  "allows NULL optional %s and rejects blank text",
  (field) => {
    expect(draftMetadataErrors({ ...baseDraft, [field]: null })).toEqual({});
    expect(draftMetadataErrors({ ...baseDraft, [field]: " " })).toHaveProperty(
      field,
    );
  },
);
it("counts Unicode code points at the accepted title bound", () => {
  expect(
    draftMetadataErrors({ ...baseDraft, title: "😀".repeat(240) }),
  ).toEqual({});
  expect(
    draftMetadataErrors({ ...baseDraft, title: "😀".repeat(241) }),
  ).toHaveProperty("title");
});
