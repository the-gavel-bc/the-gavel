import { expect, it } from "vitest";
import { baseDraft } from "../../../shared/articles/draft-contract/draft-test-cases";
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
it("does not create a second resource or accept a save for another resource/version", () => {
  const state = createDraftSaveState(baseDraft, article);
  expect(
    reduceDraftSave(state, {
      type: "submit",
      pending: {
        kind: "create",
        command: { requestId: command.requestId, draft: baseDraft },
      },
    }),
  ).toBe(state);
  expect(
    reduceDraftSave(state, {
      type: "submit",
      pending: { ...pending, command: { ...command, expectedVersion: 99 } },
    }),
  ).toBe(state);
});
it("treats an inconsistent successful resource/version as uncertainty rather than hanging", () => {
  const state = submitted();
  for (const result of [
    {
      ok: true as const,
      articleId: "other",
      version: 2,
      updatedAt: article.updatedAt,
      replayed: false,
      changed: true,
    },
    {
      ok: true as const,
      articleId: article.id,
      version: 0,
      updatedAt: article.updatedAt,
      replayed: false,
      changed: true,
    },
  ]) {
    const next = reduceDraftSave(state, {
      type: "resolve",
      requestId: command.requestId,
      result,
    });
    expect(next.phase).toBe("uncertain");
    expect(next.pending).toEqual(pending);
    expect(next.article?.version).toBe(1);
  }
});
it("UUID case and database body-key order do not produce false dirty state", () => {
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const body = {
    format: "gavel-draft" as const,
    version: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "text" as const, text: "Stored" }],
        },
      ],
    },
  };
  const state = createDraftSaveState(
    { ...baseDraft, sectionId: id, content: body },
    article,
  );
  const current = {
    ...baseDraft,
    sectionId: id.toUpperCase(),
    content: {
      document: body.document,
      version: body.version,
      format: body.format,
    },
  };
  expect(
    isDraftSaveDirty(reduceDraftSave(state, { type: "edit", input: current })),
  ).toBe(false);
});
