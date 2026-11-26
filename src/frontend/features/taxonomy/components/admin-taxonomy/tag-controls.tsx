"use client";
import { Button } from "@/frontend/components/ui/button/button";
import { IconButton } from "@/frontend/components/ui/icon-button/icon-button";
import { TrashIcon } from "@/frontend/components/ui/icons/icons";
import { useState } from "react";
import type { TaxonomyItem } from "@/backend/taxonomy/admin-taxonomy/admin-taxonomy";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { CurationFeedback } from "./curation-feedback";
import { useCuration } from "./use-curation";
import styles from "./taxonomy-controls.module.css";

export function TagControls({
  item,
  others,
}: {
  item: TaxonomyItem;
  others: { id: string; name: string }[];
}) {
  const [name, setName] = useState(item.name);
  const [target, setTarget] = useState("");
  const [problem, setProblem] = useState("");
  const state = useCuration();
  const { confirm, confirmDialog } = useConfirm();
  const normalized = name.replace(/\s+/gu, " ").trim();
  function rename() {
    if (state.blocked || normalized === item.name) return;
    if (!normalized || normalized.length > 120) {
      setProblem("Enter a name of 1 to 120 characters.");
      return;
    }
    setProblem("");
    void state.run({
      kind: "renameTag",
      requestId: crypto.randomUUID(),
      id: item.id,
      name: normalized,
    });
  }
  async function merge() {
    if (state.blocked || !target) return;
    const into = others.find((tag) => tag.id === target);
    if (
      !(await confirm({
        title: `Merge "${item.name}" into "${into?.name}"?`,
        message: `Every story keeps one copy of "${into?.name}", and "${item.name}" is removed.`,
        confirmLabel: "Merge",
        cancelLabel: "Cancel",
        danger: true,
      }))
    )
      return;
    void state.run({
      kind: "mergeTags",
      requestId: crypto.randomUUID(),
      id: item.id,
      targetId: target,
    });
  }
  async function remove() {
    if (state.blocked) return;
    if (
      !(await confirm({
        title: `Delete "${item.name}"?`,
        message: "No story uses this tag. This cannot be undone.",
        confirmLabel: "Delete",
        cancelLabel: "Keep",
        danger: true,
      }))
    )
      return;
    void state.run({
      kind: "deleteTag",
      requestId: crypto.randomUUID(),
      id: item.id,
    });
  }
  return (
    <section aria-label={`Manage tag ${item.name}`} className={styles.tag}>
      <label>
        Name
        <input
          value={name}
          maxLength={120}
          disabled={state.blocked}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <Button
        variant="secondary"
        type="button"
        onClick={rename}
        disabled={state.blocked || normalized === item.name}
        aria-label={`Rename ${item.name}`}
      >
        Rename
      </Button>
      {item.referencedLive ? (
        <>
          <label>
            Merge into
            <select
              value={target}
              disabled={state.blocked}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">Choose a tag</option>
              {others.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            type="button"
            onClick={() => void merge()}
            disabled={state.blocked || !target}
            aria-label={`Merge ${item.name}`}
          >
            Merge
          </Button>
        </>
      ) : (
        <IconButton
          variant="danger"
          onClick={() => void remove()}
          disabled={state.blocked}
          label={`Delete ${item.name}`}
          icon={<TrashIcon />}
        />
      )}
      {problem && <p role="alert">{problem}</p>}
      <CurationFeedback state={state} />
      {confirmDialog}
    </section>
  );
}
