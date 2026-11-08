"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { DraftToolbar } from "../draft-toolbar/draft-toolbar";
import { createDraftExtensions } from "@/lib/articles/draft-document/draft-extensions";
import {
  toEditorDocument,
  fromEditorDocument,
} from "@/lib/articles/draft-document/draft-document";
import {
  type DraftDocument,
  type DraftFailure,
} from "@/shared/articles/draft-contract/draft-contract";
import styles from "./draft-editor.module.css";
import { insertDraftText } from "./draft-paste";
import { DraftBodyImageControl } from "./draft-body-image-control";
// Compare already-validated JSON independent of PostgreSQL's object key ordering.
const key = (value: unknown) =>
  JSON.stringify(value, (_, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
export function DraftEditor({
  value,
  onChange,
  onError,
  disabled,
  articleId,
  allowImageUpload = true,
  onMediaDirtyChange,
}: {
  value: DraftDocument | null;
  onChange: (value: DraftDocument) => void;
  onError: (failure: DraftFailure) => void;
  disabled: boolean;
  articleId?: string;
  allowImageUpload?: boolean;
  onMediaDirtyChange?: (dirty: boolean) => void;
}) {
  const emitted = useRef(new WeakSet<DraftDocument>());
  const source = useMemo(() => toEditorDocument(value), [value]);
  const [extensions] = useState(() => createDraftExtensions(articleId));
  const [failure, setFailure] = useState<DraftFailure | null>(null);
  const reject = useCallback(
    (error: DraftFailure) => {
      setFailure(error);
      onError(error);
    },
    [onError],
  );
  const blockedPaste = () =>
    reject({
      ok: false,
      code: "invalid_input",
      fieldErrors: {
        content:
          "Paste was blocked. Paste plain text or make a valid body edit to resume saving.",
      },
    });
  const editor = useEditor({
    extensions,
    content: source.ok ? source.document : undefined,
    immediatelyRender: false,
    editable: !disabled && source.ok,
    enableContentCheck: true,
    enablePasteRules: false,
    editorProps: {
      attributes: {
        id: "draft-content",
        role: "textbox",
        "aria-label": "Article body",
        "aria-multiline": "true",
        "aria-invalid": failure ? "true" : "false",
        "aria-describedby": `draft-body-help${failure ? " draft-content-error" : ""}`,
      },
      handleDOMEvents: {
        paste: (view, event) => {
          event.preventDefault();
          if (!view.editable) return true;
          const data = event.clipboardData;
          if (
            !data ||
            data.files.length ||
            data.getData("text/html") ||
            Array.from(data.types ?? []).some((type) => type !== "text/plain")
          ) {
            blockedPaste();
            return true;
          }
          const error = insertDraftText(view, data.getData("text/plain"));
          if (error) reject(error);
          return true;
        },
        drop: (_, event) => {
          event.preventDefault();
          blockedPaste();
          return true;
        },
        click: (_, event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        auxclick: (_, event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      const result = fromEditorDocument(current.getJSON());
      if (result.ok) {
        emitted.current.add(result.document);
        setFailure(null);
        onChange(result.document);
      } else reject(result);
    },
    onContentError: () => reject({ ok: false, code: "unsupported_content" }),
  });
  useEffect(() => {
    if (!source.ok) {
      editor?.setEditable(false, false);
      onError(source);
      return;
    }
    if (!editor) return;
    if (editor.isEditable !== !disabled) editor.setEditable(!disabled, false);
    // A delayed echo of our own change must not replace newer native input.
    if (value !== null && emitted.current.has(value)) {
      emitted.current.delete(value);
      return;
    }
    const current = fromEditorDocument(editor.getJSON());
    const expected = fromEditorDocument(source.document);
    if (
      !current.ok ||
      !expected.ok ||
      key(current.document) !== key(expected.document)
    )
      editor.commands.setContent(source.document, {
        emitUpdate: false,
        errorOnInvalidContent: true,
      });
  }, [source, value, editor, disabled, onError]);
  const error = !source.ok ? source : failure;
  return (
    <section className={styles.editor} aria-label="Draft body">
      <p>Article body</p>
      <p id="draft-body-help">
        Paste plain text and use the formatting controls. Files and formatted
        content cannot be pasted.
      </p>
      {source.ok && (
        <>
          <DraftToolbar editor={editor} disabled={disabled} onError={reject} />
          {articleId && allowImageUpload && (
            <DraftBodyImageControl
              articleId={articleId}
              editor={editor}
              disabled={disabled}
              onError={reject}
              onDirtyChange={onMediaDirtyChange}
            />
          )}
          {editor ? (
            <EditorContent editor={editor} className={styles.content} />
          ) : (
            <p role="status">Loading body editor…</p>
          )}
        </>
      )}
      {error && (
        <p role="alert" id="draft-content-error" tabIndex={-1}>
          {error.fieldErrors?.content ??
            "The body is unsupported or exceeds its limits. Correct the body before saving."}
        </p>
      )}
    </section>
  );
}
