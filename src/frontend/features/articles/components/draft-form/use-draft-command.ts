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
  draftContributorLimit,
  isValidDraftDocumentForWrite,
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
    // Advance synchronously so another submit sees pending state before React rerenders.
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
    // Validate new input only for a new command. An uncertain retry must send its
    // original UUID, payload and version even if the user has since edited the form.
    if (!before.pending) {
      const checked = checkDraftInput(before.current);
      if (!checked.ok || before.nativeInvalid) {
        const failure = checked.ok
          ? {
              ok: false as const,
              code: "invalid_input" as const,
              fieldErrors: { content: "Correct the body before saving." },
            }
          : checked;
        if (
          failure.code === "invalid_input" &&
          !before.nativeInvalid &&
          !isValidDraftDocumentForWrite(before.current.content)
        ) {
          dispatch({
            type: "reject",
            failure: {
              ...failure,
              fieldErrors: {
                ...draftMetadataErrors(before.current),
                content:
                  "Check links, image alt text, and captions for invalid whitespace or control characters.",
              },
            },
          });
        } else {
          dispatch({ type: "reject", failure });
        }
        return null;
      }
      const contributorLimit = draftContributorLimit(
        before.article ? before.acknowledged.contributors.length : 0,
      );
      if (checked.value.contributors.length > contributorLimit) {
        dispatch({
          type: "reject",
          failure: {
            ok: false,
            code: "invalid_input",
            fieldErrors: {
              contributors: `Choose up to ${contributorLimit} contributors.`,
            },
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
      keepPublishedDateOnClear: status === "published",
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
  function acknowledgeArticle(resource: DraftArticle) {
    dispatch({ type: "acknowledgeArticle", article: resource });
  }
  function reload(input: DraftInput, resource: DraftArticle) {
    const before = current.current;
    return dispatch({ type: "reload", input, article: resource }) !== before;
  }
  return {
    draft: state.current,
    contributorLimit: draftContributorLimit(
      state.article ? state.acknowledged.contributors.length : 0,
    ),
    update,
    submit,
    phase: state.phase,
    failure,
    fieldErrors,
    dirty,
    article: state.article,
    pending: state.pending,
    editorInvalid,
    reload,
    acknowledgeArticle,
    hasUncommitted: () =>
      isDraftSaveDirty(current.current) || Boolean(current.current.pending),
  };
}
