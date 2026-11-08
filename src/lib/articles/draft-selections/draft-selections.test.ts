import { expect, it } from "vitest";
import { baseDraft } from "../../../shared/articles/draft-contract/draft-test-cases";
import { draftSelectionErrors } from "./draft-selections";
const id = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const options = {
  sections: [{ id: baseDraft.sectionId, name: "Section" }],
  categories: [{ id: id(2), name: "Category", sectionId: baseDraft.sectionId }],
  tags: [{ id: id(3), name: "Tag" }],
  contributors: [{ id: id(4), displayName: "Guest", slug: "guest" }],
};
it("accepts empty associations and multiple roles with tied order", () => {
  expect(draftSelectionErrors(baseDraft, options)).toEqual({});
  expect(
    draftSelectionErrors(
      {
        ...baseDraft,
        categoryIds: [id(2)],
        tagIds: [id(3)],
        contributors: [
          { profileId: id(4), role: "writer", displayOrder: 0 },
          { profileId: id(4), role: "editor", displayOrder: 0 },
        ],
      },
      options,
    ),
  ).toEqual({});
});
it("rejects unavailable or mismatched selections without modifying input", () => {
  const draft = {
    ...baseDraft,
    categoryIds: [id(5)],
    tagIds: [id(5)],
    contributors: [
      { profileId: id(5), role: "writer" as const, displayOrder: 0 },
    ],
  };
  expect(Object.keys(draftSelectionErrors(draft, options))).toEqual([
    "categoryIds",
    "tagIds",
    "contributors",
  ]);
  expect(draft.categoryIds).toEqual([id(5)]);
  expect(
    draftSelectionErrors(baseDraft, { ...options, sections: [] }),
  ).toHaveProperty("sectionId");
  expect(
    draftSelectionErrors(
      { ...baseDraft, categoryIds: [id(2)] },
      {
        ...options,
        categories: [{ ...options.categories[0], sectionId: id(99) }],
      },
    ),
  ).toHaveProperty("categoryIds");
});
it.each([
  ["categoryIds", 32],
  ["tagIds", 64],
] as const)("enforces %s caps and duplicates", (field, cap) => {
  const ids = Array.from({ length: cap }, (_, i) => id(100 + i));
  const choices = ids.map((id) => ({
    id,
    name: id,
    sectionId: baseDraft.sectionId,
  }));
  const catalog = {
    ...options,
    [field === "categoryIds" ? "categories" : "tags"]: choices,
  };
  expect(draftSelectionErrors({ ...baseDraft, [field]: ids }, catalog)).toEqual(
    {},
  );
  expect(
    draftSelectionErrors({ ...baseDraft, [field]: [...ids, id(999)] }, catalog),
  ).toHaveProperty(field);
  expect(
    draftSelectionErrors(
      { ...baseDraft, [field]: [ids[0], ids[0].toUpperCase()] },
      catalog,
    ),
  ).toHaveProperty(field);
});
it("enforces credit pair uniqueness, order range and 32-credit cap", () => {
  const people = Array.from({ length: 33 }, (_, i) => ({
    id: id(100 + i),
    displayName: "Guest",
    slug: `guest-${i}`,
  }));
  const catalog = { ...options, contributors: people };
  const credits = people.map((p) => ({
    profileId: p.id,
    role: "writer" as const,
    displayOrder: 0,
  }));
  expect(
    draftSelectionErrors(
      { ...baseDraft, contributors: credits.slice(0, 32) },
      catalog,
    ),
  ).toEqual({});
  for (const contributors of [
    credits,
    [credits[0], credits[0]],
    ...[-1, 0.5, 2147483648, NaN].map((displayOrder) => [
      { ...credits[0], displayOrder },
    ]),
  ])
    expect(
      draftSelectionErrors({ ...baseDraft, contributors }, catalog),
    ).toHaveProperty("contributors");
});
