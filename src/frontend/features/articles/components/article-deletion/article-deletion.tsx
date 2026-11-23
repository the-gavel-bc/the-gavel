"use client";
import { Button } from "@/frontend/components/ui/button/button";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GuardedDashboardLink } from "@/frontend/components/dashboard/guarded-dashboard-link/guarded-dashboard-link";
import { useDraftNavigationGuard } from "@/frontend/components/dashboard/draft-navigation-guard/draft-navigation-guard";
import { deleteArticleAction } from "@/backend/articles/article-deletion/article-deletion-actions";
import type {
  DeletionCommand,
  DeletionResult,
} from "@/shared/articles/article-deletion/article-deletion";
const messages = {
  invalid_input: "Confirm the deletion and try again.",
  forbidden: "Your administrator access no longer permits deletion.",
  conflict:
    "This article changed elsewhere. Reload to review the latest state.",
  request_conflict: "This request cannot be reused. Reload the article.",
  not_found: "This article is no longer available.",
  media_cleanup_required:
    "This article contains media or media history. Permanent deletion is not available for it yet.",
  cleanup_unavailable:
    "Media cleanup is unavailable. Run a media cleanup check before deleting articles.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
};
export function ArticleDeletion({
  articleId,
  title,
  version,
}: {
  articleId: string;
  title: string;
  version: number;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState<DeletionCommand | null>(null);
  const [result, setResult] = useState<DeletionResult | null>(null);
  const busy = useRef(false);
  useDraftNavigationGuard(pending || Boolean(retry));
  async function run(command: DeletionCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: DeletionResult;
    try {
      next = await deleteArticleAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetry(
      !next.ok &&
        (next.code === "unavailable" || retry?.requestId === command.requestId)
        ? command
        : null,
    );
    setResult(next);
    setPending(false);
    busy.current = next.ok;
    if (next.ok) {
      router.push("/dashboard/admin/articles?deleted=1");
      router.refresh();
    }
  }
  return (
    <section aria-labelledby="permanent-deletion-heading">
      <h2 id="permanent-deletion-heading">Permanently delete article</h2>
      <p>
        This permanently removes the article and its revision history. Audit
        records remain. Image removal may continue after the article is deleted.
      </p>
      <Button
        type="button"
        variant="danger"
        disabled={pending || Boolean(retry) || result?.ok === true}
        onClick={async () => {
          if (
            !(await confirm({
              title: "Permanently delete this article?",
              message: `“${title}” and its revision history will be permanently removed.`,
              confirmLabel: "Delete permanently",
              cancelLabel: "Cancel",
              danger: true,
            }))
          )
            return;
          void run({
            articleId,
            expectedVersion: version,
            requestId: crypto.randomUUID(),
            confirm: true,
          });
        }}
      >
        Permanently delete article
      </Button>
      {pending && <p role="status">Deleting article…</p>}
      {result && !result.ok && (
        <div role="alert">
          <p>{messages[result.code]}</p>
          {result.code === "cleanup_unavailable" && (
            <GuardedDashboardLink href="/dashboard/admin/media-cleanup">
              Open media cleanup
            </GuardedDashboardLink>
          )}
          {retry && (
            <Button
              variant="secondary"
              type="button"
              disabled={pending}
              onClick={() => void run(retry)}
            >
              Retry deletion
            </Button>
          )}
          {["conflict", "request_conflict"].includes(result.code) && (
            <Button
              variant="secondary"
              type="button"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Reload this article?",
                    message: "Anything not saved will be lost.",
                    confirmLabel: "Reload",
                    cancelLabel: "Cancel",
                  })
                )
                  window.location.reload();
              }}
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
