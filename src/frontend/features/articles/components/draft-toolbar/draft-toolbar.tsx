"use client";
import { useState, type ReactNode } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor, ChainedCommands } from "@tiptap/core";
import { Button } from "@/frontend/components/ui/button/button";
import {
  isValidDraftLink,
  type DraftFailure,
} from "@/shared/articles/draft-contract/draft-contract";
import styles from "./draft-toolbar.module.css";
export function DraftToolbar({
  editor,
  disabled,
  children,
}: {
  editor: Editor | null;
  disabled: boolean;
  onError: (failure: DraftFailure) => void;
  /** Extra insert controls shown beside the link buttons. */
  children?: ReactNode;
}) {
  const [href, setHref] = useState("");
  const [invalid, setInvalid] = useState(false);
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold"),
      italic: e?.isActive("italic"),
      paragraph: e?.isActive("paragraph"),
      h2: e?.isActive("heading", { level: 2 }),
      h3: e?.isActive("heading", { level: 3 }),
      quote: e?.isActive("blockquote"),
      bullet: e?.isActive("bulletList"),
      ordered: e?.isActive("orderedList"),
    }),
  });
  const run = (operation: (chain: ChainedCommands) => ChainedCommands) => {
    if (editor && !disabled)
      operation(
        editor.chain().focus(undefined, { scrollIntoView: false }),
      ).run();
  };
  function applyLink() {
    if (!isValidDraftLink(href)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    run((chain) => chain.extendMarkRange("link").setLink({ href }));
  }
  const controls: {
    label: string;
    pressed?: boolean;
    command: (chain: ChainedCommands) => ChainedCommands;
  }[] = [
    {
      label: "Paragraph",
      pressed: active?.paragraph,
      command: (c) => c.setParagraph(),
    },
    {
      label: "Heading 2",
      pressed: active?.h2,
      command: (c) => c.toggleHeading({ level: 2 }),
    },
    {
      label: "Heading 3",
      pressed: active?.h3,
      command: (c) => c.toggleHeading({ level: 3 }),
    },
    {
      label: "Quote",
      pressed: active?.quote,
      command: (c) => c.toggleBlockquote(),
    },
    {
      label: "Bulleted list",
      pressed: active?.bullet,
      command: (c) => c.toggleBulletList(),
    },
    {
      label: "Numbered list",
      pressed: active?.ordered,
      command: (c) => c.toggleOrderedList(),
    },
    { label: "Bold", pressed: active?.bold, command: (c) => c.toggleBold() },
    {
      label: "Italic",
      pressed: active?.italic,
      command: (c) => c.toggleItalic(),
    },
    { label: "Insert line break", command: (c) => c.setHardBreak() },
  ];
  return (
    <div className={styles.toolbar} role="group" aria-label="Body formatting">
      <div className={styles.buttons}>
        {controls.map((control) => (
          <Button
            key={control.label}
            disabled={disabled || !editor}
            aria-pressed={control.pressed}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(control.command)}
          >
            {control.label}
          </Button>
        ))}
      </div>
      <label htmlFor="draft-link-url" className={styles.srOnly}>
        Link URL
      </label>
      <input
        id="draft-link-url"
        type="url"
        placeholder="Link URL (https://…)"
        value={href}
        disabled={disabled || !editor}
        aria-invalid={invalid}
        aria-describedby={invalid ? "draft-link-error" : undefined}
        onChange={(event) => {
          setHref(event.target.value);
          setInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyLink();
          }
        }}
      />
      {invalid && (
        <p id="draft-link-error" role="alert">
          Use an absolute http:// or https:// link with an allowed ASCII
          hostname.
        </p>
      )}
      <div className={styles.buttons}>
        <Button
          disabled={disabled || !editor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyLink}
        >
          Apply link
        </Button>
        <Button
          disabled={disabled || !editor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run((c) => c.unsetLink())}
        >
          Remove link
        </Button>
        {children}
      </div>
    </div>
  );
}
