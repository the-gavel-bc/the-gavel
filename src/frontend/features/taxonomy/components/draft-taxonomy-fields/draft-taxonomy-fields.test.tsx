import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
import type { DraftInput } from "@/shared/articles/draft-contract/draft-contract";
import { DraftTaxonomyFields } from "./draft-taxonomy-fields";
const options = {
  sections: [],
  categories: [
    { id: "category", name: "Campus", sectionId: baseDraft.sectionId },
  ],
  tags: [{ id: "tag", name: "Topic" }],
  contributors: [],
};
function Form() {
  const [draft, onChange] = useState<DraftInput>({
    ...baseDraft,
    categoryIds: ["missing"],
  });
  return (
    <>
      <DraftTaxonomyFields
        draft={draft}
        options={options}
        errors={{}}
        onChange={onChange}
      />
      <output>{JSON.stringify(draft)}</output>
    </>
  );
}
it("retains unavailable IDs until deliberate removal and emits complete input", async () => {
  render(<Form />);
  expect(screen.getByLabelText(/Unavailable category/)).toBeChecked();
  await userEvent.click(screen.getByLabelText("Campus"));
  await userEvent.click(screen.getByLabelText("Topic"));
  expect(JSON.parse(screen.getByRole("status").textContent!)).toMatchObject({
    title: baseDraft.title,
    categoryIds: ["missing", "category"],
    tagIds: ["tag"],
  });
  await userEvent.click(screen.getByLabelText(/Unavailable category/));
  expect(
    JSON.parse(screen.getByRole("status").textContent!).categoryIds,
  ).toEqual(["category"]);
});
it("disables adding at the cap but leaves removal available", () => {
  const ids = Array.from({ length: 32 }, (_, i) => `id-${i}`);
  render(
    <DraftTaxonomyFields
      draft={{ ...baseDraft, categoryIds: ids }}
      options={options}
      errors={{ categoryIds: "Repair selections" }}
      onChange={() => {}}
    />,
  );
  expect(screen.getByLabelText("Campus")).toBeDisabled();
  expect(screen.getByLabelText(/Unavailable category: id-0$/)).toBeEnabled();
  expect(
    screen.getByRole("group", { name: "Categories" }),
  ).toHaveAccessibleDescription(/Repair selections/);
});
