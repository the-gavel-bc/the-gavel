"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveArticleCorrectionAction,
  type CorrectionCommand,
  type CorrectionResult,
} from "@/backend/articles/article-correction/article-correction-actions";
import { Button } from "@/frontend/components/ui/button/button";
import styles from "./article-correction.module.css";

const messages: Record<string, string> = {
  invalid_input:
    "Use plain text up to 2,000 characters, without < or > or invisible characters.",
  forbidden: "Your access no longer permits changing this correction.",
  not_found: "You can no longer change a correction on this article.",
  conflict:
    "Someone else changed this correction. Reload the page to see the latest.",
  request_conflict: "This request cannot be reused. Reload the page.",
  rate_limited: "Too many saves. Wait a minute, then try again.",
  retryable: "The save was interrupted. Try again.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
};

export function ArticleCorrection({
  articleId,
  correction,
}: {
  articleId: string;
  /** The stored correction, or null when there is none. */
  correction: string | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(correction);
  const [text, setText] = useState(correction ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CorrectionResult | null>(null);
  // An uncertain result is retried with the same request id so it replays
  // instead of applying twice.
  const [retry, setRetry] = useState<CorrectionCommand | null>(null);
  const busy = useRef(false);
  const dirty = text.trim() !== (saved ?? "");

  async function run(command: CorrectionCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: CorrectionResult;
    try {
      next = await saveArticleCorrectionAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    busy.current = false;
    setPending(false);
    setResult(next);
    setRetry(!next.ok && next.code === "unavailable" ? command : null);
    if (next.ok) {
      const stored = command.correction.trim() || null;
      setSaved(stored);
      setText(stored ?? "");
      router.refresh();
    }
  }

  // Not a <form>: it sits inside the article form, above its save bar, and
  // saves on its own.
  function save() {
    if (pending || retry || !dirty) return;
    void run({
      articleId,
      requestId: crypto.randomUUID(),
      expectedCorrection: saved,
      correction: text,
    });
  }

  return (
    <section className={styles.panel} aria-labelledby="correction-title">
      <h2 id="correction-title">Correction</h2>
      <label>
        <span className={styles.hint}>
          Optional. Shown at the end of the article and marks it “Updated”.
          Leave empty to remove it. Saved on its own, separately from the
          article form.
        </span>
        <textarea
          value={text}
          rows={3}
          maxLength={2000}
          placeholder="An earlier version of this article misstated…"
          disabled={pending || Boolean(retry)}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className={styles.actions}>
        <Button
          type="button"
          disabled={pending || Boolean(retry) || !dirty}
          onClick={save}
        >
          {saved === null
            ? "Add correction"
            : text.trim() === ""
              ? "Remove correction"
              : "Save correction"}
        </Button>
        {retry && (
          <Button
            variant="secondary"
            type="button"
            disabled={pending}
            onClick={() => void run(retry)}
          >
            Retry original request
          </Button>
        )}
      </div>
      {pending && <p role="status">Saving correction…</p>}
      {result?.ok && <p role="status">Correction saved.</p>}
      {result && !result.ok && <p role="alert">{messages[result.code]}</p>}
    </section>
  );
}
