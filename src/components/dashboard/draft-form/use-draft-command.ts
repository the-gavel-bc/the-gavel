"use client";
import { useEffect, useRef, useState } from "react";
import {
  createDraftAction,
  saveDraftAction,
} from "@/lib/articles/draft-actions/draft-actions";
import {
  checkDraftInput,
  draftMetadataErrors,
  type DraftInput,
  type DraftFailure,
  type DraftWriteResult,
} from "@/lib/articles/draft-contract/draft-contract";
export type DraftArticle = { id: string; version: number; updatedAt: string };
type Pending = { requestId: string; draft: DraftInput; article?: DraftArticle };
export function useDraftCommand(
  initialDraft: DraftInput,
  article?: DraftArticle,
) {
  const [draft, setDraft] = useState(initialDraft);
  const [phase, setPhase] = useState<
    "idle" | "saving" | "saved" | "error" | "uncertain"
  >("idle");
  const [failure, setFailure] = useState<DraftFailure | null>(null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialDraft));
  const currentDraft = useRef(initialDraft);
  const resource = useRef(article);
  const pending = useRef<Pending | null>(null);
  const busy = useRef(false);
  const uncertain = useRef(false);
  const dirty = JSON.stringify(draft) !== baseline;
  const locked = phase === "saving" || phase === "uncertain";
  useEffect(() => {
    if (!dirty && !pending.current) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, phase]);
  function update(value: DraftInput | ((current: DraftInput) => DraftInput)) {
    if (busy.current || pending.current) return;
    const next =
      typeof value === "function" ? value(currentDraft.current) : value;
    currentDraft.current = next;
    setDraft(next);
    setFailure(null);
    setPhase("idle");
  }
  async function submit(): Promise<DraftArticle | null> {
    if (busy.current) return null;
    if (!pending.current) {
      const checked = checkDraftInput(currentDraft.current);
      if (!checked.ok) {
        setFailure(checked);
        setPhase("error");
        return null;
      }
      pending.current = {
        requestId: crypto.randomUUID(),
        draft: checked.value,
        article: resource.current,
      };
    }
    const command = pending.current;
    busy.current = true;
    setPhase("saving");
    setFailure(null);
    let result: DraftWriteResult;
    try {
      result = command.article
        ? await saveDraftAction({
            requestId: command.requestId,
            draft: command.draft,
            articleId: command.article.id,
            expectedVersion: command.article.version,
          })
        : await createDraftAction({
            requestId: command.requestId,
            draft: command.draft,
          });
    } catch {
      result = { ok: false, code: "unavailable" };
    }
    busy.current = false;
    if (result.ok) {
      resource.current = {
        id: result.articleId,
        version: result.version,
        updatedAt: result.updatedAt,
      };
      // Inputs stay locked during saving: acknowledge the canonical submitted value too.
      currentDraft.current = command.draft;
      setDraft(command.draft);
      setBaseline(JSON.stringify(command.draft));
      pending.current = null;
      uncertain.current = false;
      setPhase("saved");
      return resource.current;
    }
    setFailure(result);
    if (result.code === "unavailable" || uncertain.current) {
      uncertain.current = true;
      setPhase("uncertain");
    } else {
      pending.current = null;
      setPhase("error");
    }
    return null;
  }
  const fieldErrors =
    failure?.code === "slug_conflict"
      ? { slug: "This slug is already in use. Choose another." }
      : (failure?.fieldErrors ??
        (failure?.code === "invalid_input" ? draftMetadataErrors(draft) : {}));
  return { draft, update, submit, phase, failure, fieldErrors, locked, dirty };
}
