import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock(
  "@/backend/taxonomy/taxonomy-curation/taxonomy-curation-action",
  () => ({
    curateTaxonomyAction: mocks.action,
  }),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { TagControls } from "./tag-controls";
import { CreateTaxonomyForm } from "./create-taxonomy-form";

const id = "81000000-0000-0000-0000-000000000001";
const other = "81000000-0000-0000-0000-000000000002";
const tag = {
  id,
  name: "Alpha",
  slug: "alpha",
  parentName: null,
  navigationOrder: null,
  active: null,
  version: null,
  referencedLive: true,
  inUse: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.action.mockResolvedValue({ ok: true });
});

it("renames a tag with single spaces", async () => {
  render(<TagControls item={tag} others={[]} />);
  expect(screen.getByRole("button", { name: "Rename Alpha" })).toBeDisabled();
  await userEvent.clear(screen.getByLabelText("Name"));
  await userEvent.type(screen.getByLabelText("Name"), "Alpha  Beta");
  await userEvent.click(screen.getByRole("button", { name: "Rename Alpha" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(mocks.action).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "renameTag", id, name: "Alpha Beta" }),
  );
});

it("merges a used tag only after confirmation and offers no delete", async () => {
  render(<TagControls item={tag} others={[{ id: other, name: "Beta" }]} />);
  expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("Merge into"), other);
  await userEvent.click(screen.getByRole("button", { name: "Merge Alpha" }));
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(mocks.action).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Merge Alpha" }));
  await userEvent.click(await screen.findByRole("button", { name: "Merge" }));
  expect(mocks.action).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "mergeTags", id, targetId: other }),
  );
});

it("deletes only unused tags and retries an uncertain request unchanged", async () => {
  mocks.action
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: true });
  render(<TagControls item={{ ...tag, referencedLive: false }} others={[]} />);
  expect(screen.queryByLabelText("Merge into")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Delete Alpha" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.action.mock.calls[1][0]).toEqual(mocks.action.mock.calls[0][0]);
});

it("creates a category under the chosen section", async () => {
  render(
    <CreateTaxonomyForm
      kind="category"
      sections={[{ id, name: "News" }]}
      nextOrder={4}
    />,
  );
  await userEvent.type(screen.getByLabelText("New category name"), "Campus");
  await userEvent.click(
    screen.getByRole("button", { name: "Create category" }),
  );
  expect(mocks.action).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "createCategory",
      name: "Campus",
      navigationOrder: 4,
      sectionId: id,
    }),
  );
});

it("refuses an empty name", async () => {
  render(<CreateTaxonomyForm kind="section" sections={[]} nextOrder={0} />);
  await userEvent.click(screen.getByRole("button", { name: "Create section" }));
  const name = screen.getByRole("textbox", { name: "New section name" });
  expect(name).toHaveFocus();
  expect(name).toHaveAccessibleDescription(/Enter a name/);
  expect(mocks.action).not.toHaveBeenCalled();
});

it("creates a section and then its first category", async () => {
  mocks.action.mockResolvedValueOnce({ ok: true, id: other });
  mocks.action.mockResolvedValueOnce({ ok: true });
  render(<CreateTaxonomyForm kind="section" sections={[]} nextOrder={2} />);
  await userEvent.type(screen.getByLabelText("New section name"), "Features");
  await userEvent.click(screen.getByLabelText("Also create a first category"));
  await userEvent.type(
    screen.getByLabelText("First category name"),
    "Profiles",
  );
  await userEvent.click(screen.getByRole("button", { name: "Create section" }));
  await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
  expect(mocks.action.mock.calls[0][0]).toMatchObject({
    kind: "createSection",
    name: "Features",
    navigationOrder: 2,
  });
  expect(mocks.action.mock.calls[1][0]).toMatchObject({
    kind: "createCategory",
    name: "Profiles",
    sectionId: other,
  });
});

it("reports a failed first category without hiding the created section", async () => {
  mocks.action.mockResolvedValueOnce({ ok: true, id: other });
  mocks.action.mockResolvedValueOnce({ ok: false, code: "conflict" });
  render(<CreateTaxonomyForm kind="section" sections={[]} nextOrder={0} />);
  await userEvent.type(screen.getByLabelText("New section name"), "Features");
  await userEvent.click(screen.getByLabelText("Also create a first category"));
  await userEvent.type(
    screen.getByLabelText("First category name"),
    "Profiles",
  );
  await userEvent.click(screen.getByRole("button", { name: "Create section" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByText('Section "Features" created.')).toBeVisible();
});
