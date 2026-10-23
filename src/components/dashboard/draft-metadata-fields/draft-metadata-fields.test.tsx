import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DraftMetadataFields } from "./draft-metadata-fields";
import { baseDraft } from "@/lib/articles/draft-contract/draft-test-cases";
const options = {
  sections: [{ id: baseDraft.sectionId, name: "Synthetic section" }],
  categories: [],
  tags: [],
  contributors: [],
};
it("labels every metadata field and preserves NULL for cleared optional text", async () => {
  const onChange = vi.fn();
  render(
    <DraftMetadataFields
      draft={{ ...baseDraft, excerpt: "Text" }}
      options={options}
      errors={{}}
      onChange={onChange}
    />,
  );
  for (const label of [
    /Title/,
    /Slug/,
    /Section/,
    /Excerpt/,
    /SEO keyphrase/,
    /Meta description/,
  ])
    expect(screen.getByLabelText(label)).toBeVisible();
  await userEvent.clear(screen.getByLabelText(/Excerpt/));
  expect(onChange.mock.lastCall?.[0].excerpt).toBeNull();
});
it("associates field errors with the controls", () => {
  render(
    <DraftMetadataFields
      draft={baseDraft}
      options={options}
      errors={{ slug: "Slug collision" }}
      onChange={() => {}}
    />,
  );
  const slug = screen.getByLabelText(/Slug/);
  expect(slug).toHaveAttribute("aria-invalid", "true");
  expect(slug).toHaveAccessibleDescription(/Slug collision/);
});
