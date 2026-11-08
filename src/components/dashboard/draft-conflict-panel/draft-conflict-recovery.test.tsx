import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/backend/articles/draft-reload-action/draft-reload-action", () => ({
  reviewDraftAction: read,
}));
import { DraftConflictPanel } from "./draft-conflict-panel";
const options = { sections: [], categories: [], tags: [], contributors: [] };
const result = {
  ok: true,
  detail: {
    kind: "editable",
    articleId: baseDraft.sectionId,
    version: 2,
    updatedAt: "2026-10-28T12:00:00Z",
    draft: baseDraft,
    unavailableSelections: {
      sectionId: null,
      categoryIds: [],
      tagIds: [],
      contributorIds: [],
    },
  },
  options,
};
it("explains a rejected outdated reload rather than silently doing nothing", async () => {
  read.mockResolvedValue(result);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(
    <DraftConflictPanel
      articleId={baseDraft.sectionId}
      local={baseDraft}
      options={options}
      onLoad={() => false}
      onBlocked={() => {}}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review latest saved version" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Load latest saved version" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/outdated|unresolved/);
  confirm.mockRestore();
});
it("ignores stale resource reads without blocking a new resource review", async () => {
  let finish!: (value: unknown) => void;
  read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(result);
  const blocked = vi.fn();
  const props = {
    local: baseDraft,
    options,
    onLoad: () => true,
    onBlocked: blocked,
  };
  const { rerender } = render(
    <DraftConflictPanel {...props} articleId={baseDraft.sectionId} />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Review latest saved version" }),
  );
  rerender(
    <DraftConflictPanel
      {...props}
      articleId="00000000-0000-0000-0000-000000000099"
    />,
  );
  expect(
    screen.getByRole("button", { name: "Review latest saved version" }),
  ).toBeEnabled();
  await act(async () => {
    finish({ ok: true, detail: { kind: "notFound" }, options: null });
  });
  expect(blocked).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
