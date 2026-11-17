"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/frontend/components/ui/button/button";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import {
  archiveArticleAction,
  restoreArticleAction,
} from "@/backend/articles/article-lifecycle/article-lifecycle-actions";
import { deleteArticleAction } from "@/backend/articles/article-deletion/article-deletion-actions";
import styles from "./article-row-actions.module.css";

type Status = "draft" | "published" | "archived";
const failure = {
  conflict: "This article changed elsewhere. Reload the list.",
  request_conflict: "This request cannot be reused. Reload the list.",
  forbidden: "Your access no longer allows this change.",
  not_found: "This article is no longer available.",
  media_cleanup_required:
    "This article has media history, so it cannot be permanently deleted yet.",
  cleanup_unavailable:
    "Media cleanup is unavailable. Run a cleanup check, then try again.",
  unavailable: "We could not confirm that. Reload the list and check.",
} as const;
const message = (code: string) =>
  failure[code as keyof typeof failure] ?? "That could not be done. Try again.";

// Edit, archive, restore and delete from the list itself. Archive is how an
// article leaves public view (there is no separate unpublish); permanent
// deletion is limited to archived articles and to administrators.
export function ArticleRowActions({
  article,
  admin,
}: {
  article: { id: string; title: string; status: Status; version: number };
  admin: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");
  const busy = useRef(false);

  async function run(
    call: () => Promise<{ ok: boolean; code?: string }>,
  ): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setProblem("");
    let result: { ok: boolean; code?: string };
    try {
      result = await call();
    } catch {
      result = { ok: false, code: "unavailable" };
    }
    busy.current = false;
    setPending(false);
    if (result.ok) router.refresh();
    else setProblem(message(result.code ?? "unavailable"));
  }
  const command = () => ({
    articleId: article.id,
    expectedVersion: article.version,
    requestId: crypto.randomUUID(),
  });

  async function archive() {
    if (
      !(await confirm({
        title: "Archive this article?",
        message: `“${article.title}” leaves public view. You can restore it later.`,
        confirmLabel: "Archive",
        cancelLabel: "Cancel",
        danger: true,
      }))
    )
      return;
    await run(() => archiveArticleAction(command()));
  }
  async function restore() {
    if (
      !(await confirm({
        title: "Restore this article?",
        message: `“${article.title}” goes back to Published.`,
        confirmLabel: "Restore",
        cancelLabel: "Cancel",
      }))
    )
      return;
    await run(() => restoreArticleAction(command()));
  }
  async function remove() {
    if (
      !(await confirm({
        title: "Permanently delete this article?",
        message: `“${article.title}” and its revision history are removed. This cannot be undone.`,
        confirmLabel: "Delete permanently",
        cancelLabel: "Cancel",
        danger: true,
      }))
    )
      return;
    await run(() => deleteArticleAction({ ...command(), confirm: true }));
  }

  return (
    <div className={styles.actions}>
      {article.status !== "archived" && (
        <Link
          className={styles.edit}
          href={`/dashboard/articles/${article.id}`}
          prefetch={false}
          aria-label={`${article.status === "draft" ? "Edit draft" : "Edit article"}: ${article.title}`}
        >
          {article.status === "draft" ? "Edit draft" : "Edit article"}
        </Link>
      )}
      {article.status === "published" && (
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => void archive()}
          aria-label={`Archive article: ${article.title}`}
        >
          Archive
        </Button>
      )}
      {article.status === "archived" && admin && (
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void restore()}
            aria-label={`Restore article: ${article.title}`}
          >
            Restore
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => void remove()}
            aria-label={`Delete article: ${article.title}`}
          >
            Delete
          </Button>
        </>
      )}
      {pending && <span role="status">Working…</span>}
      {problem && <p role="alert">{problem}</p>}
      {confirmDialog}
    </div>
  );
}
