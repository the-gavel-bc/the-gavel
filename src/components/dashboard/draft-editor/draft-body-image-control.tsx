"use client";
import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Button } from "@/components/ui/button/button";
import type { DraftFailure } from "@/shared/articles/draft-contract/draft-contract";
import { requestArticleImageUpload } from "@/lib/media/media-actions/media-actions";
import { removeUnusedArticleImage } from "@/lib/media/media-removal/media-removal";

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
  const [requestId, setRequestId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [cleanupId, setCleanupId] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const locked = disabled || busy || !editor;
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
        setAlt(node.attrs.alt);
        setCaption(node.attrs.caption ?? "");
      } else setSelected(false);
    };
    sync();
    editor.on("selectionUpdate", sync);
    return () => {
      editor.off("selectionUpdate", sync);
    };
  }, [editor]);

  async function cleanup(target: string) {
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
    setError(`Image cleanup failed (${result.code}). Retry cleanup.`);
    return false;
  }

  async function upload() {
    if (!file || locked || assetId || cleanupId) return;
    setBusy(true);
    setError("");
    setStatus("Uploading body image…");
    const retryId = requestId ?? crypto.randomUUID();
    setRequestId(retryId);
    try {
      const reserved = await requestArticleImageUpload(articleId, retryId);
      if (!reserved.ok) {
        if (reserved.code !== "unavailable") setRequestId(null);
        setError(`Image upload could not start (${reserved.code}). Retry.`);
        return;
      }
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(
        `/api/articles/${articleId}/media/${reserved.assetId}`,
        { method: "POST", body: form },
      );
      const result: unknown = await response.json();
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
      await cleanup(target);
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
    if (
      !text ||
      Array.from(text).length > 240 ||
      Array.from(note).length > 500
    ) {
      setError(
        "Alt text is required (up to 240 characters); captions are limited to 500 characters.",
      );
      onError({
        ok: false,
        code: "invalid_input",
        fieldErrors: {
          content: "Correct the body image alt text or caption before saving.",
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
    setCaption("");
    if (fileInput.current) fileInput.current.value = "";
    setStatus("Image inserted. Save the draft to keep it.");
  }

  function updateSelected() {
    if (!editor || !selected || locked) return;
    const text = alt.trim();
    const note = caption.trim();
    if (
      !text ||
      Array.from(text).length > 240 ||
      Array.from(note).length > 500
    ) {
      setError(
        "Alt text is required (up to 240 characters); captions are limited to 500 characters.",
      );
      onError({
        ok: false,
        code: "invalid_input",
        fieldErrors: {
          content: "Correct the body image alt text or caption before saving.",
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

  return (
    <fieldset disabled={disabled} aria-label="Body image">
      <legend>Body image</legend>
      <p>
        Upload a JPEG, PNG or WebP image, then add alt text and insert it. Save
        the draft afterward.
      </p>
      <label htmlFor="body-image-file">Body image file</label>
      <input
        id="body-image-file"
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={locked || Boolean(assetId || cleanupId || requestId)}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        disabled={locked || !file || Boolean(assetId || cleanupId)}
        onClick={() => void upload()}
      >
        Upload body image
      </Button>
      <label htmlFor="body-image-alt">Body image alt text</label>
      <input
        id="body-image-alt"
        value={alt}
        maxLength={240}
        onChange={(event) => setAlt(event.target.value)}
      />
      <label htmlFor="body-image-caption">Body image caption</label>
      <input
        id="body-image-caption"
        value={caption}
        maxLength={500}
        onChange={(event) => setCaption(event.target.value)}
      />
      <Button type="button" disabled={locked || !assetId} onClick={insert}>
        Insert body image
      </Button>
      {selected && (
        <>
          <Button type="button" disabled={locked} onClick={updateSelected}>
            Update selected image
          </Button>
          <Button
            type="button"
            disabled={locked}
            onClick={() => {
              editor?.commands.deleteSelection();
              setSelected(false);
              setStatus(
                "Image removed from body. Save the draft to keep this change.",
              );
            }}
          >
            Remove selected image
          </Button>
        </>
      )}
      {(assetId || cleanupId) && (
        <Button type="button" disabled={locked} onClick={() => void discard()}>
          Discard unused upload
        </Button>
      )}
      <p role="status">{status}</p>
      {error && <p role="alert">{error}</p>}
      <p>Video embeds await approved providers.</p>
    </fieldset>
  );
}
