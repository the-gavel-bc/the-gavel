import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  curate: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/backend/taxonomy/taxonomy-command/taxonomy-actions", () => ({
  updateTaxonomyAction: mocks.action,
}));
vi.mock(
  "@/backend/taxonomy/taxonomy-curation/taxonomy-curation-action",
  () => ({
    curateTaxonomyAction: mocks.curate,
  }),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { TaxonomyControls } from "./taxonomy-controls";
const item = {
  id: "81000000-0000-0000-0000-000000000001",
  name: "News",
  slug: "news",
  parentName: null,
  navigationOrder: 0,
  active: true,
  version: 1,
  referencedLive: false,
  inUse: false,
};
beforeEach(() => {
  vi.clearAllMocks();
});
it("retries an uncertain change with the same command", async () => {
  mocks.action
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: false, code: "forbidden" })
    .mockResolvedValueOnce({
      ok: true,
      id: item.id,
      kind: "section",
      version: 2,
      active: true,
      changed: true,
      replayed: true,
    });
  render(<TaxonomyControls item={item} kind="section" />);
  await userEvent.click(screen.getByRole("button", { name: "Edit News" }));
  await userEvent.clear(screen.getByLabelText("Name"));
  await userEvent.type(screen.getByLabelText("Name"), "Newsroom");
  await userEvent.click(screen.getByRole("button", { name: "Save News" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.action.mock.calls[1][0]).toEqual(mocks.action.mock.calls[0][0]);
  expect(mocks.action.mock.calls[2][0]).toEqual(mocks.action.mock.calls[0][0]);
});
it("keeps controls usable after a no-op and blocks live deactivation", async () => {
  mocks.action.mockResolvedValue({
    ok: true,
    id: item.id,
    kind: "section",
    version: 1,
    active: true,
    changed: false,
    replayed: false,
  });
  render(
    <TaxonomyControls
      item={{ ...item, referencedLive: true }}
      kind="section"
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Edit News" }));
  expect(screen.getByLabelText("Active")).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Save News" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Save News" })).toBeEnabled();
});

it("deletes an unused item only after an in-page confirmation", async () => {
  mocks.curate.mockResolvedValue({ ok: true });
  render(<TaxonomyControls item={item} kind="section" />);
  await userEvent.click(screen.getByRole("button", { name: "Delete News" }));
  await userEvent.click(await screen.findByRole("button", { name: "Keep" }));
  expect(mocks.curate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Delete News" }));
  await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(mocks.curate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "deleteTaxonomy",
        itemKind: "section",
        id: item.id,
      }),
    ),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
});

it("cannot delete an item stories use", () => {
  render(<TaxonomyControls item={{ ...item, inUse: true }} kind="section" />);
  expect(screen.getByRole("button", { name: "Delete News" })).toBeDisabled();
});
