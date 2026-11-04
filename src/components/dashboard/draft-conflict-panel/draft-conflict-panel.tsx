"use client";
import { useEffect, useRef, useState } from "react";
import {
  reviewDraftAction,
  type DraftReviewResult,
} from "@/lib/articles/draft-reload-action/draft-reload-action";
import type { DraftDetailResult } from "@/lib/articles/draft-queries/draft-queries";
import type { DraftInput } from "@/lib/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/lib/articles/draft-options/draft-options";
import { Button } from "@/components/ui/button/button";
import { DraftSnapshot } from "./draft-snapshot";
import styles from "./draft-conflict-panel.module.css";
type Editable = Extract<DraftDetailResult, { kind: "editable" }>;
export function DraftConflictPanel({
  articleId,
  local,
  options,
  nativeInvalid = false,
  disabled = false,
  onLoad,
  onBlocked,
}: {
  articleId: string;
  local: DraftInput;
  options: DraftOptions;
  nativeInvalid?: boolean;
  disabled?: boolean;
  onLoad: (detail: Editable, options: DraftOptions) => boolean;
  onBlocked: () => void;
}) {
  const [view, setView] = useState<{
    articleId: string;
    result: DraftReviewResult;
  } | null>(null);
  const [loadingId, setLoading] = useState<string | null>(null);
  const loading = loadingId === articleId;
  const [reloadError, setReloadError] = useState(false);
  const [previous, setPrevious] = useState<{
    input: DraftInput;
    options: DraftOptions;
    invalid: boolean;
  } | null>(null);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [articleId],
  );
  async function review() {
    if (disabled) return;
    const token = ++request.current;
    setLoading(articleId);
    setReloadError(false);
    setView(null);
    let result: DraftReviewResult;
    try {
      result = await reviewDraftAction(articleId);
    } catch {
      result = { ok: false, code: "unavailable" };
    }
    if (token !== request.current) return;
    setView({ articleId, result });
    setLoading(null);
    if (
      (result.ok && result.detail.kind !== "editable") ||
      (!result.ok && result.code === "forbidden")
    )
      onBlocked();
  }
  const result = view?.articleId === articleId ? view.result : null;
  const editable =
    result?.ok && result.detail.kind === "editable" && result.options
      ? { detail: result.detail, options: result.options }
      : null;
  function load() {
    if (
      disabled ||
      !editable ||
      !window.confirm(
        `Load the saved version of “${editable.detail.draft.title}”? This replaces your current unsaved changes. A reference of your last valid input stays in this tab; unsupported body edits are not copied.`,
      )
    )
      return;
    const input = structuredClone(local);
    if (onLoad(editable.detail, editable.options)) {
      setPrevious({ input, options, invalid: nativeInvalid });
      setView(null);
    } else setReloadError(true);
  }
  return (
    <section aria-label="Draft recovery" className={styles.panel}>
      <h2>Review saved changes</h2>
      <p>
        Your local input stays in the form until you deliberately load a saved
        version. Saving cannot force-overwrite another version.
      </p>
      <Button type="button" disabled={loading || disabled} onClick={review}>
        Review latest saved version
      </Button>
      {reloadError && (
        <p role="alert">
          This saved review is outdated or a save is unresolved. Review again
          before loading.
        </p>
      )}
      {loading && <p role="status">Loading latest saved version…</p>}
      {result && !result.ok && (
        <p role="alert">
          Unable to load the latest saved version. Your local input is still
          here.
        </p>
      )}
      {result?.ok && result.detail.kind !== "editable" && (
        <p role="alert">
          This article is no longer available for editing. Your local input is
          still here.
        </p>
      )}
      {editable && (
        <div>
          <h3>Latest saved version ({editable.detail.version})</h3>
          <DraftSnapshot
            input={editable.detail.draft}
            options={editable.options}
          />
          <Button type="button" disabled={disabled} onClick={load}>
            Load latest saved version
          </Button>
        </div>
      )}
      {previous && (
        <details open>
          <summary>Your previous local input</summary>
          <p>
            This reference stays only in this tab. Re-enter chosen changes in
            the current form and save explicitly.
          </p>
          {previous.invalid && (
            <p>
              Unsupported body edits are not included; this reference contains
              the last valid body.
            </p>
          )}
          <DraftSnapshot input={previous.input} options={previous.options} />
        </details>
      )}
    </section>
  );
}
