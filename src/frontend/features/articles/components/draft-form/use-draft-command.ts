"use client";
import { useCallback, useRef, useState } from "react";
import {
  createDraftAction,
  saveDraftAction,
  savePublishedArticleAction,
} from "@/backend/articles/draft-actions/draft-actions";
import {
  checkDraftInput,
  draftMetadataErrors,
  type DraftInput,
  type DraftWriteResult,
} from "@/shared/articles/draft-contract/draft-contract";
import {
  createDraftSaveState,
  reduceDraftSave,
  isDraftSaveDirty,
  type DraftArticle,
  type DraftSaveEvent,
} from "@/frontend/features/articles/draft-save-state/draft-save-state";
export type { DraftArticle };
export function useDraftCommand(
  initialDraft: DraftInput,
  article?: DraftArticle,
  status: "draft" | "published" = "draft",
) {
  const [state, setState] = useState(() =>
    createDraftSaveState(initialDraft, article),
  );
  const current = useRef(state);
  const dirty = isDraftSaveDirty(state);
  const dispatch = useCallback((event: DraftSaveEvent) => {
    const next = reduceDraftSave(current.current, event);
    current.current = next;
    setState(next);
    return next;
  }, []);
  function update(
    value: DraftInput | ((input: DraftInput) => DraftInput),
    validBody = false,
  ) {
    const input =
      typeof value === "function" ? value(current.current.current) : value;
    dispatch({
      type: "edit",
      input,
      nativeInvalid: validBody ? false : current.current.nativeInvalid,
    });
  }
  const editorInvalid = useCallback(() => {
    dispatch({
      type: "edit",
      input: current.current.current,
      nativeInvalid: true,
    });
  }, [dispatch]);
  async function submit(): Promise<DraftArticle | null> {
    let before = current.current;
    if (before.phase === "saving" || before.phase === "conflict") return null;
    if (!before.pending) {
      const checked = checkDraftInput(before.current);
      if (!checked.ok || before.nativeInvalid) {
        dispatch({
          type: "reject",
          failure: !checked.ok
            ? checked
            : {
                ok: false,
                code: "invalid_input",
                fieldErrors: { content: "Correct the body before saving." },
              },
        });
        return null;
      }
      const requestId = crypto.randomUUID();
      const resource = before.article;
      dispatch({
        type: "submit",
        pending: resource
          ? {
              kind: "save",
              command: {
                requestId,
                draft: checked.value,
                articleId: resource.id,
                expectedVersion: resource.version,
              },
            }
          : { kind: "create", command: { requestId, draft: checked.value } },
      });
    } else dispatch({ type: "submit", pending: before.pending });
    before = current.current;
    const pending = before.pending;
    if (!pending || before.phase !== "saving") return null;
    let result: DraftWriteResult;
    try {
      result =
        pending.kind === "save"
          ? status === "published"
            ? await savePublishedArticleAction(pending.command)
            : await saveDraftAction(pending.command)
          : await createDraftAction(pending.command);
    } catch {
      result = { ok: false, code: "unavailable" };
    }
    const next = dispatch({
      type: "resolve",
      requestId: pending.command.requestId,
      result,
    });
    return result.ok && next.pending === null ? (next.article ?? null) : null;
  }
  const failure =
    state.lastResult && !state.lastResult.ok ? state.lastResult : null;
  const fieldErrors =
    failure?.fieldErrors ??
    (failure?.code === "invalid_input"
      ? draftMetadataErrors(state.current)
      : {});
  function reload(input: DraftInput, resource: DraftArticle) {
    const before = current.current;
    return dispatch({ type: "reload", input, article: resource }) !== before;
  }
  return {
    draft: state.current,
    update,
    submit,
    phase: state.phase,
    failure,
    fieldErrors,
    locked: false,
    dirty,
    article: state.article,
    pending: state.pending,
    nativeInvalid: state.nativeInvalid,
    editorInvalid,
    reload,
    hasUncommitted: () =>
      isDraftSaveDirty(current.current) || Boolean(current.current.pending),
  };
}
