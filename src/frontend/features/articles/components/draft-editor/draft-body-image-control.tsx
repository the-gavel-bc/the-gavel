"use client";
import { shrinkImage } from "@/frontend/features/media/shrink-image/shrink-image";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Button } from "@/frontend/components/ui/button/button";
import {
  hasValidDraftImageText,
  type DraftFailure,
} from "@/shared/articles/draft-contract/draft-contract";
import { requestArticleImageUpload } from "@/backend/media/media-actions/media-actions";
import { removeUnusedArticleImage } from "@/backend/media/media-removal/media-removal";
import { uploadReservationMessage } from "../article-media/upload-reservation-message";
import styles from "./draft-body-image-control.module.css";

/** The toolbar's image button opens this control's file picker. */
export const BODY_IMAGE_FILE_ID = "body-image-file";

export function DraftBodyImageControl({
  articleId,
  editor,
  disabled,
  onError,
  onDirtyChange,
}: {
  articleId: string;
  editor: Editor | null;
  disabled: boolean;
  onError: (failure: DraftFailure) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [cleanupId, setCleanupId] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  // One description serves as both alt text and the caption.
  const caption = alt;
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const locked = disabled || busy || !editor;
  // While a new upload is in progress, selecting an existing image must not
  // overwrite the alt text and caption typed for the new one.
  const pendingUpload = Boolean(file || requestId || assetId || cleanupId);
  const uploading = useRef(false);
  useEffect(() => {
    uploading.current = pendingUpload;
  }, [pendingUpload]);
  useEffect(
    () => onDirtyChange?.(Boolean(file || requestId || assetId || cleanupId)),
    [file, requestId, assetId, cleanupId, onDirtyChange],
  );
  useEffect(() => {
    if (!editor || typeof editor.on !== "function") return;
    const sync = () => {
      const selection = editor.state.selection;
      const node = selection instanceof NodeSelection ? selection.node : null;
      if (node?.type.name === "image") {
        setSelected(true);
        if (!uploading.current) {
          setAlt(node.attrs.alt);
        }
      } else setSelected(false);
    };
    sync();
    editor.on("selectionUpdate", sync);
    return () => {
      editor.off("selectionUpdate", sync);
    };
  }, [editor]);

  async function cleanup(target: string) {
    // Retain this ID before awaiting cleanup so failure or a lost response remains retryable.
    setCleanupId(target);
    const result = await removeUnusedArticleImage(target);
    if (result.ok) {
      setCleanupId(null);
      setAssetId(null);
      setRequestId(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      return true;
    }
    setError("Could not discard the upload. Retry cleanup.");
    return false;
  }

  async function upload(chosen: File | null = file) {
    if (!chosen || locked || assetId || cleanupId) return;
    setBusy(true);
    setError("");
    setStatus("Uploading body image…");
    // Reuse the reservation after an uncertain upload instead of allocating another asset.
    const retryId = requestId ?? crypto.randomUUID();
    setRequestId(retryId);
    try {
      const prepared = await shrinkImage(chosen);
      if (!prepared.ok) {
        // Nothing was reserved for this attempt; keep any earlier reservation.
        setRequestId(requestId);
        setError("This image is too large to upload. Try a smaller photo.");
        return;
      }
      const reserved = await requestArticleImageUpload(articleId, retryId);
      if (!reserved.ok) {
        if (reserved.code !== "unavailable") setRequestId(null);
        setError(uploadReservationMessage(reserved.code));
        return;
      }
      const form = new FormData();
      form.set("file", prepared.file);
      const response = await fetch(
        `/api/articles/${articleId}/media/${reserved.assetId}`,
        { method: "POST", body: form },
      );
      const result: unknown = await response.json();
      if (response.status === 429) {
        setError(
          "Too many upload attempts. Wait a minute, then retry the same file.",
        );
        return;
      }
      if (response.status >= 400 && response.status < 500) {
        const removed = await cleanup(reserved.assetId);
        setError(
          removed
            ? "Choose a valid JPEG, PNG or WebP image within the upload limits."
            : "Upload rejected. Retry cleanup before choosing another file.",
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
      setAssetId(reserved.assetId);
      setRequestId(null);
      setStatus("Image ready to insert.");
    } catch {
      setError("Image upload could not be confirmed. Retry the same file.");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    const target = cleanupId ?? assetId;
    if (!target || locked) return;
    setBusy(true);
    setError("");
    try {
      if (await cleanup(target)) setStatus("Upload discarded.");
    } catch {
      setError("Image cleanup could not be confirmed. Retry cleanup.");
    } finally {
      setBusy(false);
    }
  }

  function insert() {
    if (!editor || !assetId || locked) return;
    const text = alt.trim();
    const note = caption.trim();
    if (!hasValidDraftImageText(text, note || null)) {
      setError(
        "Enter alt text and caption up to 240 characters, without control characters.",
      );
      onError({
        ok: false,
        code: "invalid_input",
        fieldErrors: {
          content: "Correct the body image alt text and caption before saving.",
        },
      });
      return;
    }
    const inserted = editor.commands.insertContent({
      type: "image",
      attrs: { assetId, alt: text, caption: note || null },
    });
    if (!inserted) {
      setError(
        "Image could not be inserted. Try another location in the body.",
      );
      return;
    }
    setAssetId(null);
    setFile(null);
    setAlt("");
    if (fileInput.current) fileInput.current.value = "";
    setStatus("Image inserted. Save the draft to keep it.");
  }

  function updateSelected() {
    if (!editor || !selected || locked) return;
    const text = alt.trim();
    const note = caption.trim();
    if (!hasValidDraftImageText(text, note || null)) {
      setError(
        "Enter alt text and caption up to 240 characters, without control characters.",
      );
      onError({
        ok: false,
        code: "invalid_input",
        fieldErrors: {
          content: "Correct the body image alt text and caption before saving.",
        },
      });
      return;
    }
    editor.commands.updateAttributes("image", {
      alt: text,
      caption: note || null,
    });
    setStatus("Image updated. Save the draft to keep it.");
  }

  const open = Boolean(
    file || requestId || assetId || cleanupId || selected || busy || error,
  );
  return (
    <>
      {/* Outside the hidden panel: some browsers will not open a picker inside display: none. */}
      <label htmlFor={BODY_IMAGE_FILE_ID} className={styles.srOnly}>
        Body image file
      </label>
      <input
        id={BODY_IMAGE_FILE_ID}
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className={styles.srOnly}
        tabIndex={-1}
        disabled={
          disabled || locked || Boolean(assetId || cleanupId || requestId)
        }
        onChange={(event) => {
          const chosen = event.target.files?.[0] ?? null;
          setFile(chosen);
          setError("");
          // Upload at once; alt text and caption can be typed meanwhile.
          if (chosen) void upload(chosen);
        }}
      />
      <fieldset
        disabled={disabled}
        aria-label="Body image"
        className={styles.panel}
        hidden={!open}
      >
        <p className={styles.title}>
          {file?.name ?? (selected ? "Selected image" : "Body image")}
        </p>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="body-image-alt">
              Body image alt text and caption
            </label>
            <input
              id="body-image-alt"
              value={alt}
              maxLength={240}
              onChange={(event) => setAlt(event.target.value)}
            />
          </div>
        </div>
        <div className={styles.actions}>
          {file && !assetId && !busy && !cleanupId && (
            <Button
              type="button"
              disabled={locked}
              onClick={() => void upload()}
            >
              Retry upload
            </Button>
          )}
          {(pendingUpload || !selected) && (
            <Button
              type="button"
              disabled={locked || !assetId}
              onClick={insert}
            >
              Insert body image
            </Button>
          )}
          {selected && !pendingUpload && (
            <>
              <Button type="button" disabled={locked} onClick={updateSelected}>
                Update selected image
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={locked}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: "Remove this image from the body?",
                      message: "Save the draft to keep this change.",
                      confirmLabel: "Remove body image",
                      cancelLabel: "Keep",
                      danger: true,
                    }))
                  )
                    return;
                  editor?.commands.deleteSelection();
                  setSelected(false);
                  setStatus(
                    "Image removed from body. Save the draft to keep this change.",
                  );
                }}
              >
                Remove body image
              </Button>
            </>
          )}
          {(assetId || cleanupId) && (
            <Button
              type="button"
              variant="danger"
              disabled={locked}
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
                  void discard();
              }}
            >
              Discard upload
            </Button>
          )}
          {file && !assetId && !busy && !cleanupId && !requestId && (
            <Button
              type="button"
              variant="secondary"
              disabled={locked}
              onClick={() => {
                setFile(null);
                setError("");
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Cancel
            </Button>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
      </fieldset>
      <p role="status" className={styles.status}>
        {status}
      </p>
      {confirmDialog}
    </>
  );
}
