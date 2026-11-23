"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/frontend/components/ui/button/button";
import styles from "./confirm-dialog.module.css";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive confirmations use the danger style. */
  danger?: boolean;
  /** Asks for a required written note (used with `ask`). */
  noteLabel?: string;
  noteMax?: number;
  validateNote?: (note: string) => string | undefined;
};

// An in-page replacement for window.confirm. Native dialogs are dismissed
// automatically by automated browsers and some embedded views, which made
// the choice flicker and silently answer "no". Usage:
//   const { confirm, confirmDialog } = useConfirm();
//   if (!(await confirm({ title, message }))) return;
//   ...render {confirmDialog} once in the component.
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<
    ((answer: { ok: boolean; note: string }) => void) | null
  >(null);
  const [note, setNote] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const noteId = useId();
  const noteMax = options?.noteMax ?? 500;
  const noteError = options?.validateNote?.(note);

  const settle = useCallback((ok: boolean, text = "") => {
    resolver.current?.({ ok, note: text.trim() });
    resolver.current = null;
    setOptions(null);
    opener.current?.focus();
  }, []);

  const open = useCallback((next: ConfirmOptions) => {
    // A second request while one is open answers the first with "no".
    resolver.current?.({ ok: false, note: "" });
    opener.current = document.activeElement as HTMLElement | null;
    setNote("");
    setOptions(next);
    return new Promise<{ ok: boolean; note: string }>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const confirm = useCallback(
    async (next: ConfirmOptions) => (await open(next)).ok,
    [open],
  );
  /** Like confirm, but also collects a required note; null when declined. */
  const ask = useCallback(
    async (next: ConfirmOptions) => {
      const answer = await open(next);
      return answer.ok ? answer.note : null;
    },
    [open],
  );

  useEffect(() => {
    if (!options) return;
    if (!options.noteLabel) cancelButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        settle(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [options, settle]);

  const confirmDialog = options ? (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (options.noteLabel && note.length > 0) {
          event.preventDefault();
          return;
        }
        settle(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className={styles.dialog}
      >
        <h2 id={titleId}>{options.title}</h2>
        <p id={messageId}>{options.message}</p>
        {options.noteLabel && (
          <div className={styles.note}>
            <label htmlFor={noteId}>{options.noteLabel}</label>
            <textarea
              id={noteId}
              aria-describedby={`${noteId}-count${noteError ? ` ${noteId}-error` : ""}`}
              aria-invalid={Boolean(noteError) || undefined}
              autoFocus
              rows={3}
              maxLength={noteMax}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <small id={`${noteId}-count`}>
              {note.length} of {noteMax} characters
            </small>
            {options.validateNote && (
              <small id={`${noteId}-error`} aria-live="polite">
                {noteError}
              </small>
            )}
          </div>
        )}
        <div className={styles.actions}>
          <Button
            ref={cancelButton}
            type="button"
            variant="secondary"
            onClick={() => settle(false)}
          >
            {options.cancelLabel ?? "Keep editing"}
          </Button>
          <Button
            type="button"
            variant={options.danger ? "danger" : undefined}
            disabled={
              Boolean(options.noteLabel) &&
              (note.trim() === "" || Boolean(noteError))
            }
            onClick={() => settle(true, note)}
          >
            {options.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ask, confirmDialog };
}
