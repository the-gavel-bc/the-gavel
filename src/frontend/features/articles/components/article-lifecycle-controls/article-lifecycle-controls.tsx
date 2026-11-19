"use client";

import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./article-lifecycle-controls.module.css";
import { Button } from "@/frontend/components/ui/button/button";
import {
  archiveArticleAction,
  publishArticleAction,
  restoreArticleAction,
  returnArticleAction,
  submitArticleAction,
} from "@/backend/articles/article-lifecycle/article-lifecycle-actions";
import type {
  ArticleLifecycleCommand,
  ArticleLifecycleResult,
} from "@/shared/articles/article-lifecycle/article-lifecycle";

const failureMessage = {
  invalid_input:
    "This draft is not ready to publish. Add a supported body, active selections, and finalized images with required details, then retry.",
  unsupported_content: "This article body format cannot be published.",
  forbidden: "Your access no longer allows this change.",
  not_found: "This article is no longer available.",
  conflict:
    "This article changed elsewhere. Reload to review its latest version.",
  slug_conflict: "This article address is unavailable.",
  request_conflict:
    "This request cannot be reused. Reload to review the article.",
  rate_limited: "Too many attempts. Wait a minute, then retry.",
  unavailable:
    "We could not confirm this change. Retry the original request to confirm it.",
} as const;

type Operation = "submit" | "publish" | "return" | "archive" | "restore";
type Offered = Partial<
  Record<
    "submit" | "publish" | "returnToAuthor" | "archive" | "restore",
    boolean
  >
>;

const operations: Record<
  Operation,
  {
    label: string;
    progress: string;
    done: string;
    danger?: boolean;
    secondary?: boolean;
    confirm: { title: string; message: string };
    hint: string;
  }
> = {
  submit: {
    label: "Submit for review",
    progress: "Submitting",
    done: "Submitted for review",
    confirm: {
      title: "Submit this article for review?",
      message:
        "An editor will check it and publish it or send it back. You cannot edit it while it is in review.",
    },
    hint: "Submit when the article and its images are ready for an editor.",
  },
  publish: {
    label: "Publish article",
    progress: "Publishing",
    done: "Published",
    confirm: {
      title: "Publish this article now?",
      message: "Readers will be able to see it.",
    },
    hint: "Publish when the article and its images are ready.",
  },
  return: {
    label: "Return to author",
    progress: "Returning",
    done: "Returned to the author",
    secondary: true,
    confirm: {
      title: "Return this article to its author?",
      message:
        "It leaves the review queue and the author can edit it again. Tell them what to change.",
    },
    hint: "Send it back with a note if it needs more work.",
  },
  archive: {
    label: "Archive article",
    progress: "Archiving",
    done: "Archived",
    danger: true,
    confirm: {
      title: "Archive this article?",
      message: "It will leave public circulation.",
    },
    hint: "Archive to remove this article from circulation.",
  },
  restore: {
    label: "Restore article",
    progress: "Restoring",
    done: "Restored",
    confirm: {
      title: "Restore this article to Published?",
      message: "It will be visible to readers again.",
    },
    hint: "Restore only when the article and its images are still ready for publication.",
  },
};
const order: Operation[] = [
  "return",
  "archive",
  "restore",
  "submit",
  "publish",
];

export function ArticleLifecycleControls({
  articleId,
  version,
  status,
  capabilities,
  disabled,
  onBusyChange,
  compact = false,
}: {
  articleId: string;
  version: number;
  status: "draft" | "published" | "archived";
  /** Which changes this member may make; defaults to the classic one per status. */
  capabilities?: Offered;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** Just the buttons, for the editor's save bar; messages float above them. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { confirm, ask, confirmDialog } = useConfirm();
  const [pending, setPending] = useState<Operation | null>(null);
  const [result, setResult] = useState<{
    operation: Operation;
    value: ArticleLifecycleResult;
  } | null>(null);
  const [retry, setRetry] = useState<{
    operation: Operation;
    command: ArticleLifecycleCommand;
  } | null>(null);
  const busy = useRef(false);
  const offered: Offered = capabilities ?? {
    publish: status === "draft",
    archive: status === "published",
    restore: status === "archived",
  };
  const available = order.filter((operation) =>
    operation === "return" ? offered.returnToAuthor : offered[operation],
  );
  const blocked = disabled || pending !== null || Boolean(result?.value.ok);

  async function run(operation: Operation) {
    if (busy.current || blocked) return;
    const spec = operations[operation];
    let command: ArticleLifecycleCommand;
    if (retry?.operation === operation) command = retry.command;
    else {
      command = {
        articleId,
        expectedVersion: version,
        requestId: crypto.randomUUID(),
      };
      if (operation === "return") {
        const note = await ask({
          ...spec.confirm,
          confirmLabel: spec.label,
          cancelLabel: "Cancel",
          noteLabel: "Note to the author",
        });
        if (!note) return;
        command = { ...command, note };
      } else if (
        !(await confirm({
          ...spec.confirm,
          confirmLabel: spec.label.replace(" article", ""),
          cancelLabel: "Cancel",
          danger: spec.danger,
        }))
      )
        return;
    }
    busy.current = true;
    setPending(operation);
    onBusyChange?.(true);
    let next: ArticleLifecycleResult;
    try {
      // Resolved lazily so only the chosen action is touched.
      next = await (operation === "submit"
        ? submitArticleAction(command)
        : operation === "publish"
          ? publishArticleAction(command)
          : operation === "return"
            ? returnArticleAction(command)
            : operation === "archive"
              ? archiveArticleAction(command)
              : restoreArticleAction(command));
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetry(
      !next.ok && (next.code === "unavailable" || retry !== null)
        ? { operation, command }
        : null,
    );
    setResult({ operation, value: next });
    setPending(null);
    busy.current = false;
    if (next.ok) {
      if (operation === "return") router.push("/dashboard/review");
      else router.refresh();
    } else onBusyChange?.(false);
  }

  const failed = result && !result.value.ok ? result.value : null;
  return (
    <section
      aria-label="Article lifecycle"
      className={compact ? styles.compact : undefined}
    >
      {available.map((operation) => (
        <p key={`hint-${operation}`} hidden={compact || undefined}>
          {operations[operation].hint}
        </p>
      ))}
      {available.map((operation) => {
        const spec = operations[operation];
        return (
          <Button
            key={operation}
            type="button"
            variant={
              spec.danger ? "danger" : spec.secondary ? "secondary" : undefined
            }
            disabled={blocked}
            title={
              compact && disabled
                ? "Save or finish pending changes before changing status."
                : undefined
            }
            onClick={() => void run(operation)}
          >
            {pending === operation
              ? `${spec.progress}…`
              : retry?.operation === operation
                ? `Retry original ${spec.label.split(" ")[0].toLowerCase()}`
                : spec.label}
          </Button>
        );
      })}
      {disabled && (
        <p hidden={compact || undefined}>
          Save or finish pending changes before changing status.
        </p>
      )}
      {pending && <p role="status">{operations[pending].progress} article…</p>}
      {result?.value.ok && (
        <p role="status">
          {operations[result.operation].done}.{" "}
          {result.operation === "publish" ||
          result.operation === "archive" ||
          result.operation === "restore"
            ? `Article ${result.value.status}. `
            : ""}
          Refreshing…
        </p>
      )}
      {failed && result && (
        <div role="alert" className={compact ? styles.note : undefined}>
          <p>
            {result.operation === "restore" && failed.code === "invalid_input"
              ? "This archive is not ready to restore. Its body, selections, and images must be repaired through a reviewed workflow."
              : failureMessage[failed.code]}
          </p>
          {(failed.code === "conflict" ||
            failed.code === "request_conflict" ||
            failed.code === "not_found") && (
            <Button
              type="button"
              disabled={disabled}
              onClick={() => router.refresh()}
            >
              Reload article
            </Button>
          )}
        </div>
      )}
      {confirmDialog}
    </section>
  );
}
