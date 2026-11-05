"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button/button";
import {
  archiveArticleAction,
  publishArticleAction,
  restoreArticleAction,
} from "@/lib/articles/article-lifecycle/article-lifecycle-actions";
import type {
  ArticleLifecycleCommand,
  ArticleLifecycleResult,
} from "@/lib/articles/article-lifecycle/article-lifecycle";

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

export function ArticleLifecycleControls({
  articleId,
  version,
  status,
  disabled,
  onBusyChange,
}: {
  articleId: string;
  version: number;
  status: "draft" | "published" | "archived";
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ArticleLifecycleResult | null>(null);
  const [retryCommand, setRetryCommand] =
    useState<ArticleLifecycleCommand | null>(null);
  const busy = useRef(false);
  const verb =
    status === "draft"
      ? "Publish"
      : status === "archived"
        ? "Restore"
        : "Archive";
  const progressVerb =
    status === "draft"
      ? "Publishing"
      : status === "archived"
        ? "Restoring"
        : "Archiving";
  const blocked = disabled || pending || Boolean(result?.ok);

  async function run() {
    if (busy.current || blocked) return;
    const command = retryCommand ?? {
      articleId,
      expectedVersion: version,
      requestId: crypto.randomUUID(),
    };
    if (
      !retryCommand &&
      !window.confirm(
        status === "draft"
          ? "Publish this article now?"
          : status === "archived"
            ? "Restore this article to Published?"
            : "Archive this article? It will leave public circulation.",
      )
    )
      return;
    busy.current = true;
    setPending(true);
    onBusyChange?.(true);
    let next: ArticleLifecycleResult;
    try {
      next =
        status === "draft"
          ? await publishArticleAction(command)
          : status === "archived"
            ? await restoreArticleAction(command)
            : await archiveArticleAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetryCommand(
      !next.ok && (next.code === "unavailable" || retryCommand !== null)
        ? command
        : null,
    );
    setResult(next);
    setPending(false);
    busy.current = false;
    if (next.ok) router.refresh();
    else onBusyChange?.(false);
  }

  return (
    <section aria-label="Article lifecycle">
      <p>
        {status === "draft"
          ? "Publish when the article and its images are ready."
          : status === "archived"
            ? "Restore only when the article and its images are still ready for publication."
            : "Archive to remove this article from circulation."}
      </p>
      <Button type="button" disabled={blocked} onClick={run}>
        {pending
          ? `${progressVerb}…`
          : retryCommand
            ? `Retry original ${verb.toLowerCase()}`
            : `${verb} article`}
      </Button>
      {disabled && (
        <p>Save or finish pending changes before changing status.</p>
      )}
      {pending && <p role="status">{progressVerb} article…</p>}
      {result?.ok && <p role="status">Article {result.status}. Refreshing…</p>}
      {result && !result.ok && (
        <div role="alert">
          <p>
            {status === "archived" && result.code === "invalid_input"
              ? "This archive is not ready to restore. Its body, selections, and images must be repaired through a reviewed workflow."
              : failureMessage[result.code]}
          </p>
          {(result.code === "conflict" ||
            result.code === "request_conflict" ||
            result.code === "not_found") && (
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
    </section>
  );
}
