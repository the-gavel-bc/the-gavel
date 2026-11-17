import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DraftMetadataFields, DraftSeoFields } from "./draft-metadata-fields";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
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
  for (const label of [/Title/, /Section/, /Excerpt/])
    expect(screen.getByLabelText(label)).toBeVisible();
  // Search details are a separate group, shown last in the editor.
  expect(screen.queryByLabelText(/SEO keyphrase/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Meta description/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Slug/)).not.toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText(/Excerpt/));
  expect(onChange.mock.lastCall?.[0].excerpt).toBeNull();
});
it("associates field errors with the controls", () => {
  render(
    <DraftMetadataFields
      draft={baseDraft}
      options={options}
      errors={{ title: "Title required" }}
      onChange={() => {}}
    />,
  );
  const title = screen.getByLabelText(/Title/);
  expect(title).toHaveAttribute("aria-invalid", "true");
  expect(title).toHaveAccessibleDescription(/Title required/);
});
it("keeps the unavailable current section visible until explicitly replaced", () => {
  render(
    <DraftMetadataFields
      draft={baseDraft}
      options={{ ...options, sections: [] }}
      errors={{}}
      onChange={() => {}}
    />,
  );
  expect(screen.getByLabelText(/Section/)).toHaveValue(baseDraft.sectionId);
  expect(screen.getByLabelText(/Section/)).toHaveDisplayValue(
    /Unavailable section/,
  );
});

it("shows the search details on their own and keeps NULL when cleared", async () => {
  const onChange = vi.fn();
  render(
    <DraftSeoFields
      draft={{ ...baseDraft, seoKeyphrase: "key", metaDescription: "desc" }}
      errors={{}}
      onChange={onChange}
    />,
  );
  expect(screen.getByLabelText(/SEO keyphrase/)).toBeVisible();
  expect(screen.getByLabelText(/Meta description/)).toBeVisible();
  expect(screen.queryByLabelText(/Title/)).not.toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText(/SEO keyphrase/));
  expect(onChange.mock.lastCall?.[0].seoKeyphrase).toBeNull();
});
