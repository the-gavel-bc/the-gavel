"use client";
import { shrinkImage } from "@/frontend/features/media/shrink-image/shrink-image";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Editor } from "@tiptap/core";
import { Button } from "@/frontend/components/ui/button/button";
import { IconButton } from "@/frontend/components/ui/icon-button/icon-button";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
} from "@/frontend/components/ui/icons/icons";
import {
  hasValidDraftImageText,
  type DraftFailure,
} from "@/shared/articles/draft-contract/draft-contract";
import { requestArticleImageUpload } from "@/backend/media/media-actions/media-actions";
import { removeUnusedArticleImage } from "@/backend/media/media-removal/media-removal";
import {
  insertDraftImage,
  moveSelectedImage,
  selectedDraftImage,
} from "@/frontend/features/articles/draft-document/draft-image-node";
import { uploadReservationMessage } from "../article-media/upload-reservation-message";
import styles from "./draft-body-image-control.module.css";

/** The toolbar's image button opens this control's file picker. */
export const BODY_IMAGE_FILE_ID = "body-image-file";

type Selected = NonNullable<ReturnType<typeof selectedDraftImage>>;
type Fields = { alt: string; caption: string; credit: string };
const EMPTY: Fields = { alt: "", caption: "", credit: "" };
const TEXT_ERROR =
  "Enter alt text (up to 240 characters), and a caption (up to 500) and credit (up to 240) if you want them. Remove control characters.";

// File names can carry characters the stored document refuses; keep a safe,
// bounded label, or none, rather than block the upload.
function safeName(name: string) {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g, "")
    .trim()
    .slice(0, 200)
    .trim();
  return cleaned || null;
}

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
  const popover = useRef<HTMLDivElement>(null);
  const { confirm, confirmDialog } = useConfirm();
  const [file, setFile] = useState<File | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [cleanupId, setCleanupId] = useState<string | null>(null);
  // Set while uploading a photo that replaces this image's photo.
  const [replacing, setReplacing] = useState<Selected | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const locked = disabled || busy || !editor;
  const pendingUpload = Boolean(file || requestId || assetId || cleanupId);
  const inserting = pendingUpload && !replacing;
  const uploading = useRef(false);
  useEffect(() => {
    uploading.current = inserting;
  }, [inserting]);
  useEffect(
    () => onDirtyChange?.(pendingUpload),
    [pendingUpload, onDirtyChange],
  );

  // Follow the editor selection: selecting an image opens its settings with
  // its current text, unless a new image's text is being filled in.
  useEffect(() => {
    if (!editor || typeof editor.on !== "function") return;
    const sync = () => {
      const next = selectedDraftImage(editor);
      setSelected((previous) => {
        if (next && previous?.pos !== next.pos) setDismissed(false);
        return next;
      });
      if (next && !uploading.current)
        setFields({
          alt: next.attrs.alt ?? "",
          caption: next.attrs.caption ?? "",
          credit: next.attrs.credit ?? "",
        });
    };
    sync();
    editor.on("selectionUpdate", sync);
    return () => {
      editor.off("selectionUpdate", sync);
    };
  }, [editor]);

  const settingsOpen = Boolean(selected && !dismissed && !inserting);
  // Place the settings just under the selected placeholder. Positions are set
  // through the DOM, not a style attribute, which the CSP forbids.
  const place = useCallback(() => {
    const panel = popover.current;
    if (!panel || !editor || !selected) return;
    // Phones show the settings as a sheet along the bottom (see the CSS).
    if (window.matchMedia?.("(max-width: 40rem)").matches) {
      panel.style.left = "";
      panel.style.top = "";
      return;
    }
    const chip = editor.view.nodeDOM(selected.pos);
    if (!(chip instanceof HTMLElement)) return;
    const rect = chip.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8),
    );
    // Below the placeholder, moved up when it would run off the screen.
    const top = Math.max(
      8,
      Math.min(rect.bottom + 6, window.innerHeight - panel.offsetHeight - 8),
    );
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }, [editor, selected]);
  useLayoutEffect(() => {
    if (!settingsOpen) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [settingsOpen, place]);

  function closeSettings() {
    setDismissed(true);
    setError("");
    editor?.commands.focus(undefined, { scrollIntoView: false });
  }

  function report() {
    setError(TEXT_ERROR);
    onError({
      ok: false,
      code: "invalid_input",
      fieldErrors: { content: "Correct the body image text before saving." },
    });
  }
  function checkedFields() {
    const alt = fields.alt.trim();
    const caption = fields.caption.trim() || null;
    const credit = fields.credit.trim() || null;
    return hasValidDraftImageText(alt, caption, true, credit)
      ? { alt, caption, credit }
      : null;
  }

  async function cleanup(target: string) {
    // Retain this ID before awaiting cleanup so failure or a lost response remains retryable.
    setCleanupId(target);
    const result = await removeUnusedArticleImage(target);
    if (result.ok) {
      setCleanupId(null);
      setAssetId(null);
      setRequestId(null);
      setFile(null);
      setReplacing(null);
      if (fileInput.current) fileInput.current.value = "";
      return true;
    }
    setError("Could not discard the upload. Retry cleanup.");
    return false;
  }

  // Swaps the photo of the image being replaced, keeping its text.
  function applyReplacement(target: Selected, uploaded: string, name: string) {
    if (!editor) return false;
    const node = editor.state.doc.nodeAt(target.pos);
    if (
      node?.type.name !== "image" ||
      node.attrs.assetId !== target.attrs.assetId
    )
      return false;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(target.pos, undefined, {
        ...node.attrs,
        assetId: uploaded,
        name: safeName(name),
      }),
    );
    return true;
  }

  async function upload(chosen: File | null = file) {
    if (!chosen || locked || assetId || cleanupId) return;
    setBusy(true);
    setError("");
    setStatus("Uploading image…");
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
      setRequestId(null);
      if (replacing) {
        const swapped = applyReplacement(
          replacing,
          reserved.assetId,
          chosen.name,
        );
        setReplacing(null);
        if (swapped) {
          setFile(null);
          if (fileInput.current) fileInput.current.value = "";
          setStatus("Image replaced. Save the draft to keep it.");
          return;
        }
        // The image moved or was removed meanwhile: offer the upload as new.
        setStatus("The original image changed. Insert this upload instead.");
      }
      setAssetId(reserved.assetId);
      if (!replacing) setStatus("Image ready to insert.");
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
    const text = checkedFields();
    if (!text) return report();
    const inserted = insertDraftImage(editor, {
      assetId,
      ...text,
      name: file ? safeName(file.name) : null,
    });
    if (!inserted) {
      setError(
        "Image could not be inserted. Try another location in the body.",
      );
      return;
    }
    setAssetId(null);
    setFile(null);
    setFields(EMPTY);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
    setStatus("Image inserted. Save the draft to keep it.");
  }

  function saveDetails() {
    if (!editor || !selected || locked) return;
    const text = checkedFields();
    if (!text) return report();
    editor.commands.updateAttributes("image", text);
    setStatus("Image details updated. Save the draft to keep them.");
    closeSettings();
  }

  async function remove() {
    if (
      !(await confirm({
        title: "Remove this image from the body?",
        message: "Save the draft to keep this change.",
        confirmLabel: "Remove image",
        cancelLabel: "Keep",
        danger: true,
      }))
    )
      return;
    editor
      ?.chain()
      .focus(undefined, { scrollIntoView: false })
      .deleteSelection()
      .run();
    setStatus(
      "Image removed from the body. Save the draft to keep this change.",
    );
  }

  const textFields = (prefix: string) => (
    <div className={styles.fields}>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-alt`}>Alt text</label>
        <input
          id={`${prefix}-alt`}
          value={fields.alt}
          maxLength={240}
          aria-describedby={`${prefix}-alt-hint`}
          onChange={(event) =>
            setFields((value) => ({ ...value, alt: event.target.value }))
          }
        />
        <span id={`${prefix}-alt-hint`} className={styles.hint}>
          Required. Describes the photo for screen readers.
        </span>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-caption`}>Caption (optional)</label>
        <input
          id={`${prefix}-caption`}
          value={fields.caption}
          maxLength={500}
          onChange={(event) =>
            setFields((value) => ({ ...value, caption: event.target.value }))
          }
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${prefix}-credit`}>Credit (optional)</label>
        <input
          id={`${prefix}-credit`}
          value={fields.credit}
          maxLength={240}
          placeholder="Photographer or source"
          onChange={(event) =>
            setFields((value) => ({ ...value, credit: event.target.value }))
          }
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Outside any hidden panel: some browsers will not open a picker inside display: none. */}
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
          // Upload at once; the text can be typed meanwhile.
          if (chosen) void upload(chosen);
          else setReplacing(null);
        }}
      />
      {/* A new image: upload progress, its text, then Insert. */}
      <fieldset
        disabled={disabled}
        aria-label="New body image"
        className={styles.panel}
        hidden={!inserting}
      >
        <p className={styles.title}>New image: {file?.name ?? "upload"}</p>
        {inserting && textFields("body-image")}
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
          <Button type="button" disabled={locked || !assetId} onClick={insert}>
            Insert body image
          </Button>
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
      {/* Settings for the selected image, shown beside it. */}
      {settingsOpen && selected && (
        <div
          ref={popover}
          role="dialog"
          aria-label="Image settings"
          className={styles.popover}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeSettings();
            }
          }}
        >
          <div className={styles.popoverHead}>
            <p className={styles.title}>
              {selected.attrs.name || "Image settings"}
            </p>
            <IconButton
              variant="secondary"
              label="Close image settings"
              icon={<CloseIcon />}
              onClick={closeSettings}
            />
          </div>
          <fieldset disabled={locked} className={styles.plain}>
            {textFields("selected-image")}
            <div className={styles.actions}>
              <Button type="button" onClick={saveDetails}>
                Save image details
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReplacing(selected);
                  fileInput.current?.click();
                }}
              >
                {replacing && busy ? "Replacing…" : "Replace image"}
              </Button>
              <IconButton
                variant="secondary"
                label="Move up"
                icon={<ArrowUpIcon />}
                disabled={selected.index === 0}
                onClick={() => editor && moveSelectedImage(editor, -1)}
              />
              <IconButton
                variant="secondary"
                label="Move down"
                icon={<ArrowDownIcon />}
                disabled={selected.index >= selected.siblings - 1}
                onClick={() => editor && moveSelectedImage(editor, 1)}
              />
              <Button
                type="button"
                variant="danger"
                onClick={() => void remove()}
              >
                Remove image
              </Button>
            </div>
            {error && <p role="alert">{error}</p>}
          </fieldset>
        </div>
      )}
      <p role="status" className={styles.status}>
        {status}
      </p>
      {confirmDialog}
    </>
  );
}
