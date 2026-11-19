"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./confirm-dialog.module.css";

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive confirmations use the danger style. */
  danger?: boolean;
};

// An in-page replacement for window.confirm. Native dialogs are dismissed
// automatically by automated browsers and some embedded views, which made
// the choice flicker and silently answer "no". Usage:
//   const { confirm, confirmDialog } = useConfirm();
//   if (!(await confirm({ title, message }))) return;
//   ...render {confirmDialog} once in the component.
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  const settle = useCallback((answer: boolean) => {
    resolver.current?.(answer);
    resolver.current = null;
    setOptions(null);
    opener.current?.focus();
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second request while one is open answers the first with "no".
    resolver.current?.(false);
    opener.current = document.activeElement as HTMLElement | null;
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!options) return;
    cancelButton.current?.focus();
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
        if (event.target === event.currentTarget) settle(false);
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
        <div className={styles.actions}>
          <button
            ref={cancelButton}
            type="button"
            className={styles.cancel}
            onClick={() => settle(false)}
          >
            {options.cancelLabel ?? "Keep editing"}
          </button>
          <button
            type="button"
            className={styles.confirm}
            data-danger={options.danger || undefined}
            onClick={() => settle(true)}
          >
            {options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmDialog };
}
