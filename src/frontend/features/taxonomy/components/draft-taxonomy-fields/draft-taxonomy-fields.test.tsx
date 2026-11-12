import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ensure: vi.fn() }));
vi.mock("@/backend/taxonomy/ensure-tag/ensure-tag-action", () => ({
  ensureTagAction: mocks.ensure,
}));
beforeEach(() => {
  vi.clearAllMocks();
});
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
  await userEvent.type(screen.getByLabelText("Add tag"), "topic{Enter}");
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

it("creates a typed tag, announces errors and permits removing chips", async () => {
  mocks.ensure
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({
      ok: true,
      id: "new",
      name: "New tag",
      slug: "new-tag",
      created: true,
    });
  render(<Form />);
  await userEvent.type(screen.getByLabelText("Add tag"), "New tag{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(/Unable/);
  await userEvent.keyboard("{Enter}");
  expect(
    await screen.findByRole("button", { name: "Remove tag New tag" }),
  ).toBeEnabled();
  expect(mocks.ensure).toHaveBeenCalledWith("New tag");
  await userEvent.click(
    screen.getByRole("button", { name: "Remove tag New tag" }),
  );
  expect(JSON.parse(screen.getByRole("status").textContent!).tagIds).toEqual(
    [],
  );
});
it("uses a local match on comma and prevents duplicates", async () => {
  render(<Form />);
  await userEvent.type(screen.getByLabelText("Add tag"), "TOPIC,");
  await userEvent.type(screen.getByLabelText("Add tag"), "Topic{Enter}");
  expect(mocks.ensure).not.toHaveBeenCalled();
  expect(JSON.parse(screen.getByRole("status").textContent!).tagIds).toEqual([
    "tag",
  ]);
});
it("retains older selections beyond ten and allows removal", async () => {
  const onChange = vi.fn();
  const tagIds = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
  render(
    <DraftTaxonomyFields
      draft={{ ...baseDraft, tagIds }}
      options={options}
      errors={{}}
      onChange={onChange}
    />,
  );
  expect(screen.getByLabelText("Add tag")).toBeDisabled();
  expect(screen.getByText(/10 tags/)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Remove tag Unavailable tag: tag-0" }),
  );
  expect(onChange.mock.calls[0][0].tagIds).toEqual(tagIds.slice(1));
});
it("preserves intervening edits while a new tag request resolves", async () => {
  let resolve!: (value: unknown) => void;
  mocks.ensure.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<Form />);
  await userEvent.type(screen.getByLabelText("Add tag"), "New{Enter}");
  await userEvent.click(screen.getByLabelText("Campus"));
  resolve({ ok: true, id: "new", name: "New", slug: "new", created: true });
  await screen.findByRole("button", { name: "Remove tag New" });
  expect(
    JSON.parse(screen.getByRole("status").textContent!).categoryIds,
  ).toEqual(["missing", "category"]);
});

it("reports locally cached server tags again after a catalog replacement", async () => {
  const onOption = vi.fn();
  const onChange = vi.fn();
  mocks.ensure.mockResolvedValue({
    ok: true,
    id: "cached",
    name: "Cached tag",
    slug: "cached-tag",
    created: true,
  });
  const view = render(
    <DraftTaxonomyFields
      draft={baseDraft}
      options={options}
      errors={{}}
      onChange={onChange}
      onOption={onOption}
    />,
  );
  await userEvent.type(screen.getByLabelText("Add tag"), "Cached tag{Enter}");
  await waitFor(() =>
    expect(onOption).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cached" }),
    ),
  );
  onOption.mockClear();
  view.rerender(
    <DraftTaxonomyFields
      draft={baseDraft}
      options={{ ...options, tags: [] }}
      errors={{}}
      onChange={onChange}
      onOption={onOption}
    />,
  );
  await userEvent.type(screen.getByLabelText("Add tag"), "cached TAG{Enter}");
  expect(onOption).toHaveBeenCalledWith(
    expect.objectContaining({ id: "cached" }),
  );
  expect(mocks.ensure).toHaveBeenCalledOnce();
});
