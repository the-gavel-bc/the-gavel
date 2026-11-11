import { expect, it } from "vitest";
import type { DraftDocument } from "@/shared/articles/draft-contract/draft-contract";
import { draftInputKey } from "./draft-input-key";
import { baseDraft } from "../../../../shared/articles/draft-contract/draft-test-cases";
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
it("late success acknowledges only submitted input and ignores mismatched replies", () => {
  let state = submitted();
  state = reduceDraftSave(state, {
    type: "edit",
    input: { ...baseDraft, title: "Newer" },
  });
  expect(
    reduceDraftSave(state, {
      type: "resolve",
      requestId: "other",
      result: success,
    }),
  ).toBe(state);
  state = reduceDraftSave(state, {
    type: "resolve",
    requestId: command.requestId,
    result: success,
  });
  expect(state.current.title).toBe("Newer");
  expect(state.acknowledged.title).toBe(baseDraft.title);
  expect(state.article?.version).toBe(2);
  expect(isDraftSaveDirty(state)).toBe(true);
});
it("retains the immutable command across editing, uncertainty and access errors", () => {
  let state = submitted();
  state = reduceDraftSave(state, {
    type: "resolve",
    requestId: command.requestId,
    result: { ok: false, code: "unavailable" },
  });
  state = reduceDraftSave(state, {
    type: "edit",
    input: { ...baseDraft, title: "Latest" },
  });
  expect(state.phase).toBe("uncertain");
  const retry = state.pending!;
  state = reduceDraftSave(state, { type: "submit", pending: retry });
  state = reduceDraftSave(state, {
    type: "resolve",
    requestId: command.requestId,
    result: { ok: false, code: "forbidden" },
  });
  expect(state.phase).toBe("uncertain");
  expect(state.pending).toEqual(pending);
  state = reduceDraftSave(state, { type: "submit", pending: state.pending! });
  state = reduceDraftSave(state, {
    type: "resolve",
    requestId: command.requestId,
    result: { ...success, replayed: true },
  });
  expect(state.current.title).toBe("Latest");
  expect(state.pending).toBeNull();
});
it("does not accept duplicate or changed pending commands", () => {
  const state = submitted();
  expect(reduceDraftSave(state, { type: "submit", pending })).toBe(state);
  const unknown = reduceDraftSave(state, {
    type: "resolve",
    requestId: command.requestId,
    result: { ok: false, code: "unavailable" },
  });
  expect(
    reduceDraftSave(unknown, {
      type: "submit",
      pending: { ...pending, command: { ...command, requestId: "new" } },
    }),
  ).toBe(unknown);
});
it("native invalid input stays dirty after a matching successful receipt", () => {
  let state = reduceDraftSave(submitted(), {
    type: "edit",
    input: baseDraft,
    nativeInvalid: true,
  });
  state = reduceDraftSave(state, {
    type: "resolve",
    requestId: command.requestId,
    result: success,
  });
  expect(isDraftSaveDirty(state)).toBe(true);
  expect(state.nativeInvalid).toBe(true);
});
it("create success adopts the created resource while retaining newer input", () => {
  let state = reduceDraftSave(createDraftSaveState(baseDraft), {
    type: "submit",
    pending: {
      kind: "create",
      command: { requestId: command.requestId, draft: baseDraft },
    },
  });
  state = reduceDraftSave(state, {
    type: "edit",
    input: { ...baseDraft, title: "Keep newest" },
  });
  state = reduceDraftSave(state, {
    type: "resolve",
    requestId: command.requestId,
    result: success,
  });
  expect(state.article?.id).toBe(article.id);
  expect(state.current.title).toBe("Keep newest");
  expect(state.phase).toBe("idle");
});

it("metadata edits do not traverse an unchanged immutable body", () => {
  let reads = 0;
  const document: DraftDocument["document"] = {
    type: "doc",
    content: Array.from({ length: 100 }, (_, index) => ({
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: `Paragraph ${index}` }],
    })),
  };
  const content: DraftDocument = {
    format: "gavel-draft",
    version: 1,
    get document() {
      reads += 1;
      return document;
    },
  };
  const input = { ...baseDraft, content };
  let state = createDraftSaveState(input, article);
  expect(reads).toBe(1);
  for (let index = 0; index < 20; index += 1) {
    state = reduceDraftSave(state, {
      type: "edit",
      input: { ...state.current, title: `Title ${index}` },
    });
  }
  // Deterministic operation evidence: 20 metadata edits, zero body traversals.
  expect(reads).toBe(1);
  expect(isDraftSaveDirty(state)).toBe(true);
  state = reduceDraftSave(state, { type: "edit", input });
  expect(reads).toBe(1);
  expect(isDraftSaveDirty(state)).toBe(false);
  const replacement: DraftDocument = {
    ...content,
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "New" }] },
      ],
    },
  };
  state = reduceDraftSave(state, {
    type: "edit",
    input: { ...input, content: replacement },
  });
  expect(state.currentKey).toBe(draftInputKey(state.current));
  expect(isDraftSaveDirty(state)).toBe(true);
});

it("body edits during a pending save survive acknowledgement and later metadata edits", () => {
  const content: DraftDocument = {
    format: "gavel-draft",
    version: 1,
    document: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "New body" }] },
      ],
    },
  };
  let state = reduceDraftSave(submitted(), {
    type: "edit",
    input: { ...baseDraft, content },
  });
  state = reduceDraftSave(state, {
    type: "resolve",
    requestId: command.requestId,
    result: success,
  });
  expect(state.current.content).toBe(content);
  expect(state.acknowledged).toEqual(baseDraft);
  state = reduceDraftSave(state, {
    type: "edit",
    input: { ...state.current, excerpt: "Latest excerpt" },
  });
  expect(state.currentKey).toBe(draftInputKey(state.current));
  expect(isDraftSaveDirty(state)).toBe(true);
});

it("a successful matching snapshot and external reload retain correct body keys", () => {
  let state = reduceDraftSave(submitted(), {
    type: "resolve",
    requestId: command.requestId,
    result: success,
  });
  expect(isDraftSaveDirty(state)).toBe(false);
  expect(state.currentKey).toBe(draftInputKey(state.current));
  const input = { ...baseDraft, content: null, title: "Loaded elsewhere" };
  state = reduceDraftSave(state, {
    type: "reload",
    article: { ...article, version: 3 },
    input,
  });
  state = reduceDraftSave(state, {
    type: "edit",
    input: { ...input, title: "Metadata after reload" },
  });
  expect(state.currentKey).toBe(draftInputKey(state.current));
  expect(isDraftSaveDirty(state)).toBe(true);
});

it("media acknowledgement preserves newer metadata, body and invalid-native state", () => {
  const start = createDraftSaveState(baseDraft, article);
  const input = {
    ...baseDraft,
    title: "Typed during image save",
    content: {
      format: "gavel-draft" as const,
      version: 1 as const,
      document: {
        type: "doc" as const,
        content: [
          {
            type: "paragraph" as const,
            content: [{ type: "text" as const, text: "New body" }],
          },
        ],
      },
    },
  };
  const edited = reduceDraftSave(start, {
    type: "edit",
    input,
    nativeInvalid: true,
  });
  const next = reduceDraftSave(edited, {
    type: "acknowledgeArticle",
    article: { ...article, version: 2 },
  });
  expect(next.current).toBe(input);
  expect(next.acknowledged).toBe(start.acknowledged);
  expect(next.nativeInvalid).toBe(true);
  expect(next.article?.version).toBe(2);
  expect(isDraftSaveDirty(next)).toBe(true);
  expect(
    reduceDraftSave(start, {
      type: "acknowledgeArticle",
      article: { ...article, version: 2 },
    }).current,
  ).toBe(start.current);
});
it("rejects media acknowledgements for a pending save, another article or older version", () => {
  const state = createDraftSaveState(baseDraft, { ...article, version: 3 });
  for (const resource of [
    { ...article, version: 2 },
    { ...article, id: "other", version: 4 },
  ])
    expect(
      reduceDraftSave(state, { type: "acknowledgeArticle", article: resource }),
    ).toBe(state);
  const pendingState = submitted();
  expect(
    reduceDraftSave(pendingState, {
      type: "acknowledgeArticle",
      article: { ...article, version: 2 },
    }),
  ).toBe(pendingState);
});
