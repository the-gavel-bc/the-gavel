"use client";

import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/frontend/components/ui/button/button";
import type { DraftArticle } from "@/frontend/features/articles/draft-save-state/draft-save-state";
import type { DraftWriteResult } from "@/shared/articles/draft-contract/draft-contract";
import {
  requestArticleImageUpload,
  setArticleMainImage,
} from "@/backend/media/media-actions/media-actions";
import type { MainImage } from "@/backend/media/media-queries/media-queries";
import { removeUnusedArticleImage } from "@/backend/media/media-removal/media-removal";
import styles from "./article-media.module.css";

type Confirmed = Extract<DraftWriteResult, { ok: true }>;
type ImageCommand = {
  articleId: string;
  expectedVersion: number;
  requestId: string;
  assetId: string | null;
  altText: string | null;
  credit: string | null;
  caption: string | null;
};
type PendingWrite = {
  command: ImageCommand;
  input: { altText: string; credit: string; caption: string };
  uncertain: boolean;
};

export function ArticleMedia({
  article,
  initialImage,
  disabled,
  onCommit,
  onDirtyChange,
  onBusyChange,
  initialFile,
  published = false,
}: {
  article: DraftArticle;
  initialImage: MainImage | null;
  disabled: boolean;
  onCommit: (result: Confirmed) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  /** A file chosen before the draft existed; uploaded once on mount. */
  initialFile?: File | null;
  /** Readers can see this article, so removing its photo asks first. */
  published?: boolean;
}) {
  const [image, setImage] = useState(initialImage);
  const { confirm, confirmDialog } = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [cleanupAssetId, setCleanupAssetId] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uploadRequestId, setUploadRequestId] = useState<string | null>(null);
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null);
  const [altText, setAltText] = useState(initialImage?.altText ?? "");
  const [credit, setCredit] = useState(initialImage?.credit ?? "");
  const [caption, setCaption] = useState(initialImage?.caption ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const locked = disabled || busy || conflict || Boolean(cleanupAssetId);
  const mutationLocked = locked || Boolean(pendingWrite);
  const metadataChanged = image
    ? altText !== image.altText ||
      credit !== image.credit ||
      caption !== (image.caption ?? "")
    : Boolean(altText || credit || caption);
  const dirty = Boolean(
    file || assetId || cleanupAssetId || pendingWrite || metadataChanged,
  );
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(
    () => onBusyChange?.(busy || Boolean(pendingWrite)),
    [busy, pendingWrite, onBusyChange],
  );

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const started = useRef(false);
  useEffect(() => {
    if (!initialFile || started.current) return;
    started.current = true;
    void upload(initialFile);
    // Runs once for the file handed over at creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(selected: File | null = file) {
    if (!selected || mutationLocked) return;
    setBusy(true);
    setError("");
    setStatus("Uploading image…");
    const requestId = uploadRequestId ?? crypto.randomUUID();
    setUploadRequestId(requestId);
    try {
      const reservation = await requestArticleImageUpload(
        article.id,
        requestId,
      );
      if (!reservation.ok) {
        if (reservation.code !== "unavailable") setUploadRequestId(null);
        setError(`Image upload could not start (${reservation.code}). Retry.`);
        return;
      }
      const body = new FormData();
      body.set("file", selected);
      const response = await fetch(
        `/api/articles/${article.id}/media/${reservation.assetId}`,
        { method: "POST", body },
      );
      const result: unknown = await response.json();
      if (response.status === 429) {
        setError(
          "Too many upload attempts. Wait a minute, then retry the same file.",
        );
        return;
      }
      if (response.status >= 400 && response.status < 500) {
        setCleanupAssetId(reservation.assetId);
        const removed = await removeUnusedArticleImage(reservation.assetId);
        if (removed.ok) {
          setCleanupAssetId(null);
          setUploadRequestId(null);
          setFile(null);
          if (fileInput.current) fileInput.current.value = "";
        }
        setError(
          removed.ok
            ? response.status === 400 || response.status === 413
              ? "Choose a valid JPEG, PNG or WebP image within the size and dimension limits."
              : "This upload cannot continue. Choose a new file or refresh your access."
            : "Upload rejected. Cleanup failed; retry cleanup before choosing another file.",
        );
        return;
      }
      if (
        !response.ok ||
        !result ||
        typeof result !== "object" ||
        !("ok" in result) ||
        result.ok !== true
      ) {
        setError("Image upload could not be confirmed. Retry the same file.");
        return;
      }
      setAssetId(reservation.assetId);
      setUploadRequestId(null);
      setStatus("Image ready to attach.");
    } catch {
      setError("Image upload could not be confirmed. Retry the same file.");
    } finally {
      setBusy(false);
    }
  }

  function commit(
    next: Pick<ImageCommand, "assetId" | "altText" | "credit" | "caption">,
  ) {
    if (mutationLocked) return;
    const write = {
      command: {
        articleId: article.id,
        expectedVersion: article.version,
        requestId: crypto.randomUUID(),
        ...next,
      },
      input: { altText, credit, caption },
      uncertain: false,
    };
    setPendingWrite(write);
    void sendWrite(write);
  }

  async function sendWrite(write: PendingWrite) {
    if (busy || conflict) return;
    const { command, input } = write;
    setBusy(true);
    setError("");
    setStatus("Saving image…");
    try {
      // An uncertain write must replay its original version and payload, even
      // after newer draft props or image metadata arrive.
      const result = await setArticleMainImage(command);
      if (!result.ok) {
        // Access and ownership checks precede receipt lookup. Their denials
        // cannot resolve an earlier uncertain write; preserve its exact retry.
        if (
          result.code === "unavailable" ||
          (write.uncertain &&
            (result.code === "forbidden" || result.code === "not_found"))
        ) {
          setPendingWrite({ ...write, uncertain: true });
          setError(
            `Original image change is still unconfirmed (${result.code}). Retry the same change.`,
          );
          return;
        }
        if (result.code === "conflict") {
          setConflict(true);
          setError(
            "This draft changed elsewhere. Reload to review its current version.",
          );
        } else setError(`Image change was not saved (${result.code}). Retry.`);
        setPendingWrite(null);
        return;
      }
      setPendingWrite(null);
      setImage(
        command.assetId && command.altText && command.credit
          ? {
              assetId: command.assetId,
              altText: command.altText,
              credit: command.credit,
              caption: command.caption,
            }
          : null,
      );
      setAltText((current) =>
        current === input.altText ? (command.altText ?? "") : current,
      );
      setCredit((current) =>
        current === input.credit ? (command.credit ?? "") : current,
      );
      setCaption((current) =>
        current === input.caption ? (command.caption ?? "") : current,
      );
      setAssetId(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setStatus(command.assetId ? "Image attached." : "Image removed.");
      onCommit(result);
    } catch {
      setPendingWrite({ ...write, uncertain: true });
      setError("Image change could not be confirmed. Retry the same change.");
    } finally {
      setBusy(false);
    }
  }

  function attach() {
    const targetAssetId = assetId ?? image?.assetId;
    if (!targetAssetId) return;
    const alt = altText.trim();
    const by = credit.trim();
    if (!alt || !by) {
      setError("Alt text and credit are required.");
      return;
    }
    const description = caption.trim();
    if (Array.from(description).length > 400) {
      setError("Caption must be 400 characters or fewer.");
      return;
    }
    void commit({
      assetId: targetAssetId,
      altText: alt,
      credit: by,
      caption: description || null,
    });
  }

  async function discardUpload() {
    const target = cleanupAssetId ?? assetId;
    if (!target || disabled || busy || conflict || pendingWrite) return;
    setBusy(true);
    setError("");
    setStatus("Deleting image…");
    try {
      const result = await removeUnusedArticleImage(target);
      if (!result.ok) {
        setError(`Image could not be deleted (${result.code}). Retry.`);
        return;
      }
      setAssetId(null);
      setCleanupAssetId(null);
      setUploadRequestId(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      if (!image) {
        setAltText("");
        setCredit("");
        setCaption("");
      }
      setStatus("Image deleted.");
    } catch {
      setError("Image could not be deleted. Retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="article-main-image-heading"
      className={styles.section}
    >
      <h2 id="article-main-image-heading">Main image</h2>
      <p>
        JPEG, PNG or WebP, up to 10 MB. The photo uploads as soon as you choose
        it; add alt text and a photo credit, then attach it.
      </p>
      {disabled && <p>Save your draft changes before managing its image.</p>}
      {image && (
        <>
          {/* Private media route: only the owner or an administrator can load it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.preview}
            src={`/api/articles/${article.id}/media/${image.assetId}`}
            alt={image.altText}
            loading="lazy"
          />
          <p>
            Attached image: {image.altText} — {image.credit}
          </p>
        </>
      )}
      <div className={styles.fields}>
        <label htmlFor="article-image-file">Image file</label>
        <input
          id="article-image-file"
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={
            mutationLocked ||
            Boolean(assetId) ||
            Boolean(uploadRequestId) ||
            Boolean(cleanupAssetId)
          }
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setAssetId(null);
            setUploadRequestId(null);
            setStatus("");
            setError("");
            // Upload immediately; alt text and credit can be typed meanwhile.
            if (selected) void upload(selected);
          }}
        />
        {file && !assetId && !busy && (
          <Button
            type="button"
            disabled={mutationLocked}
            onClick={() => void upload()}
          >
            {error ? "Retry upload" : "Upload image"}
          </Button>
        )}
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.preview} src={preview} alt="" />
        )}
        <label htmlFor="article-image-alt">Alt text</label>
        <input
          id="article-image-alt"
          value={altText}
          maxLength={240}
          disabled={locked}
          onChange={(event) => setAltText(event.target.value)}
        />
        <label htmlFor="article-image-credit">Image credit</label>
        <input
          id="article-image-credit"
          value={credit}
          maxLength={240}
          disabled={locked}
          onChange={(event) => setCredit(event.target.value)}
        />
        <label htmlFor="article-image-caption">Caption</label>
        <textarea
          id="article-image-caption"
          value={caption}
          maxLength={400}
          disabled={locked}
          aria-describedby="article-image-caption-hint"
          onChange={(event) => setCaption(event.target.value)}
        />
        <p id="article-image-caption-hint">
          Optional. Up to 400 characters, shown under the photo.
        </p>
      </div>
      <div className={styles.actions}>
        <Button
          type="button"
          disabled={mutationLocked || (!assetId && !metadataChanged)}
          onClick={attach}
        >
          {assetId ? "Attach image" : "Update image details"}
        </Button>
        {assetId && (
          <Button
            type="button"
            disabled={mutationLocked}
            onClick={async () => {
              if (
                await confirm({
                  title: "Discard this upload?",
                  message:
                    "The uploaded image is removed. This cannot be undone.",
                  confirmLabel: "Discard upload",
                  cancelLabel: "Keep",
                  danger: true,
                })
              )
                void discardUpload();
            }}
          >
            Delete image
          </Button>
        )}
        {cleanupAssetId && (
          <Button
            type="button"
            disabled={disabled || busy || Boolean(pendingWrite)}
            onClick={() => void discardUpload()}
          >
            Retry cleanup
          </Button>
        )}
        {pendingWrite && (
          <Button
            type="button"
            disabled={busy || conflict}
            onClick={() => void sendWrite(pendingWrite)}
          >
            Retry image change
          </Button>
        )}
        {conflict && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => window.location.reload()}
          >
            Reload draft
          </Button>
        )}
        {image && (
          <Button
            type="button"
            variant="danger"
            disabled={mutationLocked}
            onClick={async () => {
              if (
                !(await confirm({
                  title: "Remove the main image?",
                  message: published
                    ? "Readers will stop seeing it on this published article."
                    : "The image is removed from this draft.",
                  confirmLabel: "Remove image",
                  cancelLabel: "Keep",
                  danger: true,
                }))
              )
                return;
              void commit({
                assetId: null,
                altText: null,
                credit: null,
                caption: null,
              });
            }}
          >
            Remove image
          </Button>
        )}
      </div>
      {busy && <progress aria-label="Image operation in progress" />}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {confirmDialog}
    </section>
  );
}
