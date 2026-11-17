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
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
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
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  await userEvent.click(screen.getByRole("button", { name: "Merge Alpha" }));
  expect(mocks.action).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Merge Alpha" }));
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
  expect(screen.getByRole("alert")).toBeVisible();
  expect(mocks.action).not.toHaveBeenCalled();
});
