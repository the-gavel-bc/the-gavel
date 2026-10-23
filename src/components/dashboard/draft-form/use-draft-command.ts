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
  const baseline = useRef(JSON.stringify(initialDraft));
  const resource = useRef(article);
  const pending = useRef<Pending | null>(null);
  const busy = useRef(false);
  const dirty = JSON.stringify(draft) !== baseline.current;
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
  function update(value: DraftInput) {
    if (busy.current || pending.current) return;
    setDraft(value);
    setFailure(null);
    setPhase("idle");
  }
  async function submit(): Promise<boolean> {
    if (busy.current) return false;
    if (!pending.current) {
      const checked = checkDraftInput(draft);
      if (!checked.ok) {
        setFailure(checked);
        setPhase("error");
        return false;
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
      baseline.current = JSON.stringify(command.draft);
      pending.current = null;
      setPhase("saved");
      return true;
    }
    setFailure(result);
    if (result.code === "unavailable") setPhase("uncertain");
    else {
      pending.current = null;
      setPhase("error");
    }
    return false;
  }
  const fieldErrors =
    failure?.code === "slug_conflict"
      ? { slug: "This slug is already in use. Choose another." }
      : (failure?.fieldErrors ??
        (failure?.code === "invalid_input" ? draftMetadataErrors(draft) : {}));
  return { draft, update, submit, phase, failure, fieldErrors, locked, dirty };
}
