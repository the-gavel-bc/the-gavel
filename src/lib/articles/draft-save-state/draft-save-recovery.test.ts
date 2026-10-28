import { expect, it } from "vitest";
import { baseDraft } from "../draft-contract/draft-test-cases";
import {
  createDraftSaveState,
  reduceDraftSave,
  isDraftSaveDirty,
} from "./draft-save-state";
const article = {
  id: baseDraft.sectionId,
  version: 1,
  updatedAt: "2026-10-28T12:00:00Z",
};
const command = {
  requestId: "00000000-0000-0000-0000-000000000099",
  draft: baseDraft,
  articleId: article.id,
  expectedVersion: 1,
};
const pending = { kind: "save" as const, command };
const success = {
  ok: true as const,
  articleId: article.id,
  version: 2,
  updatedAt: article.updatedAt,
  replayed: false,
  changed: true,
};
function submitted() {
  return reduceDraftSave(createDraftSaveState(baseDraft, article), {
    type: "submit",
    pending,
  });
}
it.each(["conflict", "slug_conflict", "rate_limited"] as const)(
  "preserves current input after %s",
  (code) => {
    const state = reduceDraftSave(submitted(), {
      type: "resolve",
      requestId: command.requestId,
      result: { ok: false, code },
    });
    expect(state.current).toEqual(baseDraft);
    expect(state.pending).toBeNull();
    expect(state.phase).toBe(code === "conflict" ? "conflict" : "error");
  },
);
it("only deliberate same-resource non-stale reload replaces input", () => {
  const state = reduceDraftSave(submitted(), {
    type: "resolve",
    requestId: command.requestId,
    result: { ok: false, code: "conflict" },
  });
  const input = { ...baseDraft, title: "Saved elsewhere" };
  const reload = {
    type: "reload" as const,
    article: { ...article, version: 3 },
    input,
  };
  expect(reduceDraftSave(submitted(), reload).pending).not.toBeNull();
  expect(
    reduceDraftSave(state, { ...reload, article: { ...article, id: "other" } }),
  ).toBe(state);
  const loaded = reduceDraftSave(state, reload);
  expect(loaded.current.title).toBe("Saved elsewhere");
  expect(isDraftSaveDirty(loaded)).toBe(false);
  expect(reduceDraftSave(loaded, { ...reload, article })).toBe(loaded);
});
it("canonical association ordering and database object-key ordering are clean", () => {
  const draft = {
    ...baseDraft,
    contributors: [
      { profileId: article.id, role: "writer" as const, displayOrder: 0 },
      { profileId: article.id, role: "editor" as const, displayOrder: 0 },
    ],
  };
  let state = createDraftSaveState(draft, article);
  state = reduceDraftSave(state, {
    type: "edit",
    input: { ...draft, contributors: [...draft.contributors].reverse() },
  });
  expect(isDraftSaveDirty(state)).toBe(false);
});

it("snapshots input instead of retaining caller aliases", () => {
  const draft = { ...baseDraft, title: "Snapshot" };
  const state = reduceDraftSave(createDraftSaveState(baseDraft, article), {
    type: "submit",
    pending: { ...pending, command: { ...command, draft } },
  });
  draft.title = "Mutated caller";
  expect(state.pending?.command.draft.title).toBe("Snapshot");
});
