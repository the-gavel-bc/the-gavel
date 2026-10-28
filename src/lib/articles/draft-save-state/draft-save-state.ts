import type {
  DraftInput,
  CreateDraftCommand,
  SaveDraftCommand,
  DraftWriteResult,
  DraftFailure,
} from "../draft-contract/draft-contract";
import { draftInputKey } from "./draft-input-key";
export type DraftArticle = { id: string; version: number; updatedAt: string };
export type PendingDraftCommand =
  | { kind: "create"; command: CreateDraftCommand }
  | { kind: "save"; command: SaveDraftCommand };
export type DraftSaveState = {
  current: DraftInput;
  acknowledged: DraftInput;
  currentKey: string;
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
    }
  | { type: "reload"; article: DraftArticle; input: DraftInput }
  | { type: "reject"; failure: DraftFailure };
export function createDraftSaveState(
  input: DraftInput,
  article?: DraftArticle,
): DraftSaveState {
  const key = draftInputKey(input);
  return {
    current: input,
    acknowledged: input,
    currentKey: key,
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
  return state.nativeInvalid || state.currentKey !== state.acknowledgedKey;
}
export function reduceDraftSave(
  state: DraftSaveState,
  event: DraftSaveEvent,
): DraftSaveState {
  switch (event.type) {
    case "edit":
      return {
        ...state,
        current: event.input,
        currentKey: draftInputKey(event.input),
        nativeInvalid: event.nativeInvalid ?? false,
        phase:
          state.pending || state.phase === "conflict" ? state.phase : "idle",
        lastResult:
          state.pending || state.phase === "conflict" ? state.lastResult : null,
      };
    case "reject":
      return state.pending
        ? state
        : { ...state, phase: "error", lastResult: event.failure };
    case "submit": {
      if (state.phase === "saving" || state.phase === "conflict") return state;
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
        const uncertain = state.uncertain || result.code === "unavailable";
        return {
          ...state,
          lastResult: result,
          uncertain,
          pending: uncertain ? pending : null,
          phase: uncertain
            ? "uncertain"
            : result.code === "conflict"
              ? "conflict"
              : "error",
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
      const acknowledged = pending.command.draft;
      const acknowledgedKey = draftInputKey(acknowledged);
      const newer = state.nativeInvalid || state.currentKey !== acknowledgedKey;
      return {
        ...state,
        current: newer ? state.current : acknowledged,
        currentKey: newer ? state.currentKey : acknowledgedKey,
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
    case "reload":
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
