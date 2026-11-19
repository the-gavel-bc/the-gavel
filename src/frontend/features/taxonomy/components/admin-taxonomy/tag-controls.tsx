"use client";
import { useState } from "react";
import type { TaxonomyItem } from "@/backend/taxonomy/admin-taxonomy/admin-taxonomy";
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
  function merge() {
    if (state.blocked || !target) return;
    const into = others.find((tag) => tag.id === target);
    if (
      !window.confirm(
        `Merge "${item.name}" into "${into?.name}"? Every story keeps one copy of the surviving tag, and "${item.name}" is removed.`,
      )
    )
      return;
    void state.run({
      kind: "mergeTags",
      requestId: crypto.randomUUID(),
      id: item.id,
      targetId: target,
    });
  }
  function remove() {
    if (state.blocked) return;
    if (!window.confirm(`Delete the unused tag "${item.name}"?`)) return;
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
      <button
        type="button"
        onClick={rename}
        disabled={state.blocked || normalized === item.name}
        aria-label={`Rename ${item.name}`}
      >
        Rename
      </button>
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
          <button
            type="button"
            onClick={merge}
            disabled={state.blocked || !target}
            aria-label={`Merge ${item.name}`}
          >
            Merge
          </button>
        </>
      ) : (
        <button
          type="button"
          data-variant="danger"
          onClick={remove}
          disabled={state.blocked}
          aria-label={`Delete ${item.name}`}
        >
          Delete unused tag
        </button>
      )}
      {problem && <p role="alert">{problem}</p>}
      <CurationFeedback state={state} />
    </section>
  );
}
