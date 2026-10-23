"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { DraftToolbar } from "../draft-toolbar/draft-toolbar";
import { createDraftExtensions } from "@/lib/articles/draft-document/draft-extensions";
import {
  toEditorDocument,
  fromEditorDocument,
} from "@/lib/articles/draft-document/draft-document";
import {
  draftJsonbByteLength,
  type DraftDocument,
  type DraftFailure,
} from "@/lib/articles/draft-contract/draft-contract";
import styles from "./draft-editor.module.css";
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
}: {
  value: DraftDocument | null;
  onChange: (value: DraftDocument) => void;
  onError: (failure: DraftFailure) => void;
  disabled: boolean;
}) {
  const source = useMemo(() => toEditorDocument(value), [value]);
  const [extensions] = useState(createDraftExtensions);
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
        "aria-describedby": "draft-body-help",
      },
      handleDOMEvents: {
        paste: (_, event) => {
          const data = event.clipboardData;
          const text = data?.getData("text/plain") ?? "";
          const bytes = draftJsonbByteLength(text);
          if (
            !data ||
            data.files.length ||
            data.getData("text/html") ||
            bytes === null ||
            bytes > 1048576
          ) {
            event.preventDefault();
            blockedPaste();
            return true;
          }
          return false;
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
    editor.setEditable(!disabled, false);
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
  }, [source, editor, disabled, onError]);
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
