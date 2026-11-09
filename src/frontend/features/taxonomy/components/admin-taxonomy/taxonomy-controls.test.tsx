import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("@/backend/taxonomy/taxonomy-command/taxonomy-actions", () => ({
  updateTaxonomyAction: mocks.action,
}));
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
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
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
  expect(screen.getByLabelText("Active")).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Save News" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Save News" })).toBeEnabled();
});
