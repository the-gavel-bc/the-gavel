"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/frontend/components/ui/button/button";
import { listUnusedArticleUploads } from "@/backend/media/unused-article-uploads/unused-article-uploads";
import type { UnusedArticleUploadsResult } from "@/backend/media/unused-article-uploads/unused-article-uploads";
import { removeUnusedArticleImage } from "@/backend/media/media-removal/media-removal";

type Page = Extract<UnusedArticleUploadsResult, { ok: true }>;
export function UnusedArticleUploads({
  articleId,
  refreshKey,
  localAssetIds,
  disabled,
  onBusyChange,
}: {
  articleId: string;
  refreshKey: string;
  localAssetIds: ReadonlySet<string>;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const loadKey = `${articleId}:${refreshKey}`;
  const [listing, setListing] = useState<{
    key: string;
    page: Page | null;
    loading: boolean;
    error: boolean;
  }>({ key: "", page: null, loading: false, error: false });
  // A changed resource/version immediately hides stale results before its effect runs.
  const page = listing.key === loadKey ? listing.page : null;
  const loading = listing.key !== loadKey || listing.loading;
  const error = listing.key === loadKey && listing.error;
  const [message, setMessage] = useState("");
  const [retryAsset, setRetryAsset] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    const request = ++generation.current;
    void listUnusedArticleUploads(articleId)
      .then((result) => {
        if (!active || request !== generation.current) return;
        setListing({
          key: loadKey,
          page: result.ok ? result : null,
          loading: false,
          error: !result.ok,
        });
      })
      .catch(() => {
        if (!active || request !== generation.current) return;
        setListing({ key: loadKey, page: null, loading: false, error: true });
      });
    return () => {
      active = false;
    };
  }, [articleId, loadKey]);

  async function load(afterId: string | null = null) {
    const request = ++generation.current;
    setListing((current) => ({
      key: loadKey,
      page: current.key === loadKey ? current.page : null,
      loading: true,
      error: false,
    }));
    try {
      const result = await listUnusedArticleUploads(articleId, afterId);
      if (request !== generation.current) return;
      setListing({
        key: loadKey,
        page: result.ok ? result : null,
        loading: false,
        error: !result.ok,
      });
      if (result.ok) {
        if (
          retryAsset &&
          afterId === null &&
          !result.items.some((item) => item.assetId === retryAsset)
        ) {
          // Absence may mean a new reference, access changes, or completed cleanup.
          setMessage(
            "The earlier upload is no longer on this page of unused uploads. Refreshing does not confirm deletion.",
          );
        }
      }
    } catch {
      if (request === generation.current)
        setListing({ key: loadKey, page: null, loading: false, error: true });
    }
  }
  async function discard(assetId: string) {
    if (
      disabled ||
      busyRef.current ||
      (retryAsset !== null && retryAsset !== assetId) ||
      localAssetIds.has(assetId.toLowerCase())
    )
      return;
    busyRef.current = true;
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    let unresolved = false;
    try {
      const result = await removeUnusedArticleImage(assetId);
      if (result.ok) {
        setListing((current) => ({
          ...current,
          page: current.page
            ? {
                ...current.page,
                items: current.page.items.filter(
                  (item) => item.assetId !== assetId,
                ),
              }
            : null,
        }));
        setRetryAsset(null);
        setMessage("Unused upload discarded.");
      } else if (result.code === "unavailable") {
        unresolved = true;
        setRetryAsset(assetId);
        setMessage(
          "Cleanup could not be confirmed. Retry cleanup or refresh the list.",
        );
      } else {
        setRetryAsset(null);
        setMessage(
          "This upload is no longer available for unused cleanup. This does not confirm deletion. Refresh the list.",
        );
      }
    } catch {
      unresolved = true;
      setRetryAsset(assetId);
      setMessage(
        "Cleanup could not be confirmed. Retry cleanup or refresh the list.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      // Archiving while cleanup is uncertain could prevent its authorized retry.
      onBusyChange(unresolved);
    }
  }
  const visible =
    page?.items.filter(
      (item) => !localAssetIds.has(item.assetId.toLowerCase()),
    ) ?? [];
  return (
    <section aria-label="Unused uploads">
      <h2>Unused uploads</h2>
      <p>
        Discard uploads that are absent from saved content and retained
        revisions. This permanently removes the unused file.
      </p>
      {disabled && (
        <p>
          Finish uploads and resolve any save or editor issue before discarding
          files.
        </p>
      )}
      <Button
        type="button"
        disabled={loading || busy}
        onClick={() => void load()}
      >
        Refresh unused uploads
      </Button>
      {loading && <p role="status">Loading unused uploads…</p>}
      {error && (
        <p role="alert">Unable to load unused uploads. Refresh to retry.</p>
      )}
      {!loading && page && visible.length === 0 && (
        <p>
          No unused uploads on this page. Images in your current input are
          hidden.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {retryAsset && !visible.some((item) => item.assetId === retryAsset) && (
        <Button
          type="button"
          disabled={disabled || busy || loading}
          onClick={() => void discard(retryAsset)}
        >
          Retry cleanup
        </Button>
      )}
      {visible.length > 0 && (
        <ul>
          {visible.map((item) => (
            <li key={item.assetId}>
              <span>
                Upload {item.assetId}, created {item.createdAt}
              </span>{" "}
              <Button
                type="button"
                disabled={
                  disabled ||
                  busy ||
                  loading ||
                  (retryAsset !== null && retryAsset !== item.assetId)
                }
                onClick={() => void discard(item.assetId)}
              >
                {item.status === "deleting" || retryAsset === item.assetId
                  ? "Retry cleanup"
                  : "Discard unused upload"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {page?.nextCursor && (
        <Button
          type="button"
          disabled={loading || busy}
          onClick={() => void load(page.nextCursor)}
        >
          Next unused uploads
        </Button>
      )}
    </section>
  );
}
