import type {
  DraftInput,
  CreateDraftCommand,
  SaveDraftCommand,
  DraftWriteResult,
  DraftFailure,
} from "../../../../shared/articles/draft-contract/draft-contract";
import {
  draftContentKey,
  draftInputKeyWithContentKey,
} from "./draft-input-key";
export type DraftArticle = { id: string; version: number; updatedAt: string };
export type PendingDraftCommand =
  | { kind: "create"; command: CreateDraftCommand }
  | { kind: "save"; command: SaveDraftCommand };
// Current input may change while a write is in flight. Acknowledged tracks the initial
// baseline or a confirmed snapshot; pending keeps the exact command for retries.
export type DraftSaveState = {
  current: DraftInput;
  acknowledged: DraftInput;
  currentKey: string;
  currentContentKey: string;
  acknowledgedKey: string;
  article?: DraftArticle;
  pending: PendingDraftCommand | null;
  uncertain: boolean;
  nativeInvalid: boolean;
  phase: "idle" | "saving" | "saved" | "error" | "uncertain" | "conflict";
  lastResult: DraftWriteResult | null;
};
export type DraftSaveEvent =
  | { type: "edit"; input: DraftInput; nativeInvalid?: boolean }
  | { type: "submit"; pending: PendingDraftCommand }
  | {
      type: "resolve";
      requestId: string;
      result: DraftWriteResult;
      keepPublishedDateOnClear?: boolean;
    }
  | { type: "acknowledgeArticle"; article: DraftArticle }
  | { type: "reload"; article: DraftArticle; input: DraftInput }
  | { type: "reject"; failure: DraftFailure };
export function createDraftSaveState(
  input: DraftInput,
  article?: DraftArticle,
): DraftSaveState {
  const contentKey = draftContentKey(input.content);
  const key = draftInputKeyWithContentKey(input, contentKey);
  return {
    current: input,
    acknowledged: input,
    currentKey: key,
    currentContentKey: contentKey,
    acknowledgedKey: key,
    article,
    pending: null,
    uncertain: false,
    nativeInvalid: false,
    phase: "idle",
    lastResult: null,
  };
}
export function isDraftSaveDirty(state: DraftSaveState): boolean {
  // Invalid editor input is absent from the last valid snapshot but can still be lost.
  return state.nativeInvalid || state.currentKey !== state.acknowledgedKey;
}
export function reduceDraftSave(
  state: DraftSaveState,
  event: DraftSaveEvent,
): DraftSaveState {
  switch (event.type) {
    case "edit": {
      // Form edits replace bodies rather than mutating them. Metadata changes retain
      // the body identity, so reuse its key without traversing the document again.
      const contentKey =
        event.input.content === state.current.content
          ? state.currentContentKey
          : draftContentKey(event.input.content);
      return {
        ...state,
        current: event.input,
        currentKey: draftInputKeyWithContentKey(event.input, contentKey),
        currentContentKey: contentKey,
        nativeInvalid: event.nativeInvalid ?? false,
        phase:
          state.pending || state.phase === "conflict" ? state.phase : "idle",
        lastResult:
          state.pending || state.phase === "conflict" ? state.lastResult : null,
      };
    }
    case "reject":
      return state.pending
        ? state
        : { ...state, phase: "error", lastResult: event.failure };
    case "submit": {
      if (state.phase === "saving" || state.phase === "conflict") return state;
      // An uncertain write must reuse its stored command, never newer form input.
      if (state.pending && state.pending !== event.pending) return state;
      if (
        !state.pending &&
        ((event.pending.kind === "create" && state.article) ||
          (event.pending.kind === "save" &&
            (!state.article ||
              event.pending.command.articleId !== state.article.id ||
              event.pending.command.expectedVersion !== state.article.version)))
      )
        return state;
      return {
        ...state,
        pending: state.pending ?? structuredClone(event.pending),
        phase: "saving",
        lastResult: null,
      };
    }
    case "resolve": {
      const pending = state.pending;
      if (
        !pending ||
        pending.command.requestId !== event.requestId ||
        state.phase !== "saving"
      )
        return state;
      const result = event.result;
      if (!result.ok) {
        // A lost response may hide a commit; preserve its handle unless receipt lookup proves failure.
        // Conflict responses follow receipt lookup; access/missing-resource denials may precede it.
        const definitive =
          pending.kind === "save" &&
          (result.code === "conflict" || result.code === "request_conflict");
        const uncertain =
          !definitive && (state.uncertain || result.code === "unavailable");
        return {
          ...state,
          lastResult: result,
          uncertain,
          pending: uncertain || result.code === "retryable" ? pending : null,
          phase: uncertain ? "uncertain" : definitive ? "conflict" : "error",
        };
      }
      if (
        pending.kind === "save" &&
        (result.articleId !== pending.command.articleId ||
          result.version < pending.command.expectedVersion)
      )
        return {
          ...state,
          phase: "uncertain",
          uncertain: true,
          lastResult: { ok: false, code: "unavailable" },
        };
      // Confirm only the submitted snapshot; edits made during the request stay dirty.
      const submitted = pending.command.draft;
      // A published clear keeps the previous reader date. The receipt still
      // acknowledges the original command, so retries send it unchanged.
      const retainedDate =
        event.keepPublishedDateOnClear && submitted.publicationDate == null
          ? state.acknowledged.publicationDate
          : null;
      const acknowledged = retainedDate
        ? { ...submitted, publicationDate: retainedDate }
        : submitted;
      const current =
        retainedDate && state.current.publicationDate == null
          ? { ...state.current, publicationDate: retainedDate }
          : state.current;
      const currentKey =
        current === state.current
          ? state.currentKey
          : draftInputKeyWithContentKey(current, state.currentContentKey);
      const contentKey = draftContentKey(acknowledged.content);
      const acknowledgedKey = draftInputKeyWithContentKey(
        acknowledged,
        contentKey,
      );
      const newer = state.nativeInvalid || currentKey !== acknowledgedKey;
      return {
        ...state,
        current: newer ? current : acknowledged,
        currentKey: newer ? currentKey : acknowledgedKey,
        currentContentKey: newer ? state.currentContentKey : contentKey,
        acknowledged,
        acknowledgedKey,
        article: {
          id: result.articleId,
          version: result.version,
          updatedAt: result.updatedAt,
        },
        pending: null,
        uncertain: false,
        lastResult: result,
        phase: newer ? "idle" : "saved",
      };
    }
    case "acknowledgeArticle":
      // A media write changes the article version, not the saved text snapshot.
      // Read current reducer state so edits made during that write remain dirty.
      if (
        state.pending ||
        !state.article ||
        state.article.id !== event.article.id ||
        event.article.version < state.article.version
      )
        return state;
      return { ...state, article: event.article };
    case "reload":
      // A read cannot resolve an uncertain write or roll back a known article version.
      if (
        state.pending ||
        !state.article ||
        state.article.id !== event.article.id ||
        event.article.version < state.article.version
      )
        return state;
      return createDraftSaveState(event.input, event.article);
  }
}
