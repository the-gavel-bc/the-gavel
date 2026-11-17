import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock(
  "@/frontend/components/ui/confirm-dialog/use-confirm",
  () => import("@/frontend/components/ui/confirm-dialog/use-confirm.window"),
);
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/backend/articles/draft-reload-action/draft-reload-action", () => ({
  reviewDraftAction: read,
}));
import { DraftConflictPanel } from "./draft-conflict-panel";
const options = {
  sections: [{ id: baseDraft.sectionId, name: "Section" }],
  categories: [],
  tags: [],
  contributors: [],
};
const detail = {
  kind: "editable",
  articleId: baseDraft.sectionId,
  version: 2,
  updatedAt: "2026-10-28T12:00:00Z",
  draft: { ...baseDraft, title: "Saved elsewhere" },
  unavailableSelections: {
    sectionId: null,
    categoryIds: [],
    tagIds: [],
    contributorIds: [],
  },
};
beforeEach(() => vi.resetAllMocks());
it("reviews without replacing input and requires explicit load confirmation", async () => {
  const load = vi.fn(() => true);
  read.mockResolvedValue({ ok: true, detail, options });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <DraftConflictPanel
      articleId={baseDraft.sectionId}
      local={baseDraft}
      options={options}
      onLoad={load}
      onBlocked={() => {}}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review latest saved version" }),
  );
  expect(await screen.findByText("Saved elsewhere")).toBeVisible();
  expect(load).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Load latest saved version" }),
  );
  expect(load).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Load latest saved version" }),
  );
  expect(load).toHaveBeenCalledWith(detail, options);
  expect(screen.getByText("Your previous local input")).toBeVisible();
  confirm.mockRestore();
});
it("keeps failure and unsupported results read-only", async () => {
  read
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({
      ok: true,
      detail: { kind: "unsupportedContent" },
      options: null,
    });
  const blocked = vi.fn();
  render(
    <DraftConflictPanel
      articleId={baseDraft.sectionId}
      local={baseDraft}
      options={options}
      onLoad={() => true}
      onBlocked={blocked}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review latest saved version" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to load/);
  await userEvent.click(
    screen.getByRole("button", { name: "Review latest saved version" }),
  );
  await waitFor(() => expect(blocked).toHaveBeenCalled());
  expect(
    screen.queryByRole("button", { name: "Load latest saved version" }),
  ).not.toBeInTheDocument();
});
