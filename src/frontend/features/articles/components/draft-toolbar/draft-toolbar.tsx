"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor, ChainedCommands } from "@tiptap/core";
import { Button } from "@/frontend/components/ui/button/button";
import { IconButton } from "@/frontend/components/ui/icon-button/icon-button";
import {
  BulletListIcon,
  LineBreakIcon,
  LinkIcon,
  NumberedListIcon,
  QuoteIcon,
  UnlinkIcon,
} from "@/frontend/components/ui/icons/icons";
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
  // The URL field only shows after "Insert link" is pressed.
  const [linkOpen, setLinkOpen] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (linkOpen) linkInput.current?.focus();
  }, [linkOpen]);
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
    setLinkOpen(false);
  }
  function toggleLink() {
    if (linkOpen) {
      setLinkOpen(false);
      return;
    }
    // Editing an existing link starts from its address.
    const current = editor?.getAttributes("link").href;
    setHref(typeof current === "string" ? current : "");
    setInvalid(false);
    setLinkOpen(true);
  }
  const controls: {
    label: string;
    icon: ReactNode;
    pressed?: boolean;
    command: (chain: ChainedCommands) => ChainedCommands;
  }[] = [
    {
      label: "Paragraph",
      icon: <span className={styles.glyph}>¶</span>,
      pressed: active?.paragraph,
      command: (c) => c.setParagraph(),
    },
    {
      label: "Heading 2",
      icon: <span className={styles.glyph}>H2</span>,
      pressed: active?.h2,
      command: (c) => c.toggleHeading({ level: 2 }),
    },
    {
      label: "Heading 3",
      icon: <span className={styles.glyph}>H3</span>,
      pressed: active?.h3,
      command: (c) => c.toggleHeading({ level: 3 }),
    },
    {
      label: "Quote",
      icon: <QuoteIcon />,
      pressed: active?.quote,
      command: (c) => c.toggleBlockquote(),
    },
    {
      label: "Bulleted list",
      icon: <BulletListIcon />,
      pressed: active?.bullet,
      command: (c) => c.toggleBulletList(),
    },
    {
      label: "Numbered list",
      icon: <NumberedListIcon />,
      pressed: active?.ordered,
      command: (c) => c.toggleOrderedList(),
    },
    {
      label: "Bold",
      icon: <b className={styles.glyph}>B</b>,
      pressed: active?.bold,
      command: (c) => c.toggleBold(),
    },
    {
      label: "Italic",
      icon: <i className={styles.glyph}>I</i>,
      pressed: active?.italic,
      command: (c) => c.toggleItalic(),
    },
    {
      label: "Insert line break",
      icon: <LineBreakIcon />,
      command: (c) => c.setHardBreak(),
    },
  ];
  return (
    <div className={styles.toolbar} role="group" aria-label="Body formatting">
      <div className={styles.buttons}>
        {controls.map((control) => (
          <IconButton
            key={control.label}
            label={control.label}
            icon={control.icon}
            disabled={disabled || !editor}
            aria-pressed={control.pressed}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(control.command)}
          />
        ))}
      </div>
      <div className={styles.buttons}>
        <IconButton
          label="Insert link"
          icon={<LinkIcon />}
          aria-expanded={linkOpen}
          aria-controls="draft-link-panel"
          disabled={disabled || !editor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleLink}
        />
        <IconButton
          label="Remove link"
          icon={<UnlinkIcon />}
          disabled={disabled || !editor}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run((c) => c.unsetLink())}
        />
        {children}
      </div>
      {linkOpen && (
        <div id="draft-link-panel" className={styles.linkPanel}>
          <label htmlFor="draft-link-url" className={styles.srOnly}>
            Link URL
          </label>
          <input
            ref={linkInput}
            id="draft-link-url"
            type="url"
            placeholder="https://…"
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
              } else if (event.key === "Escape") {
                event.preventDefault();
                setLinkOpen(false);
              }
            }}
          />
          <Button
            disabled={disabled || !editor}
            onMouseDown={(event) => event.preventDefault()}
            onClick={applyLink}
          >
            Apply link
          </Button>
          <Button variant="secondary" onClick={() => setLinkOpen(false)}>
            Cancel
          </Button>
          {invalid && (
            <p id="draft-link-error" role="alert">
              Use an absolute http:// or https:// link with an allowed ASCII
              hostname.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
