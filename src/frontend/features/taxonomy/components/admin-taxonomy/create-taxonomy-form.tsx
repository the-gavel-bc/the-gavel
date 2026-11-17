"use client";
import { useState } from "react";
import { CurationFeedback } from "./curation-feedback";
import { useCuration } from "./use-curation";
import list from "@/frontend/components/dashboard/admin-list/admin-list.module.css";

export function CreateTaxonomyForm({
  kind,
  sections,
  nextOrder,
}: {
  kind: "section" | "category";
  sections: { id: string; name: string }[];
  nextOrder: number;
}) {
  const [name, setName] = useState("");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [order, setOrder] = useState(String(nextOrder));
  const [problem, setProblem] = useState("");
  const state = useCuration(() => setName(""));
  const noun = kind === "section" ? "section" : "category";
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state.blocked) return;
    const value = Number(order);
    if (
      !name.trim() ||
      name !== name.trim() ||
      !/^\d+$/u.test(order) ||
      value > 2147483647 ||
      (kind === "category" && !sectionId)
    ) {
      setProblem("Enter a name without leading or trailing spaces.");
      return;
    }
    setProblem("");
    const base = {
      requestId: crypto.randomUUID(),
      name,
      navigationOrder: value,
    };
    void state.run(
      kind === "section"
        ? { kind: "createSection", ...base }
        : { kind: "createCategory", ...base, sectionId },
    );
  }
  return (
    <form onSubmit={submit} className={list.toolbar} aria-label={`New ${noun}`}>
      <label>
        {`New ${noun} name`}
        <input
          value={name}
          maxLength={120}
          disabled={state.blocked}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {kind === "category" && (
        <label>
          Section
          <select
            value={sectionId}
            disabled={state.blocked}
            onChange={(event) => setSectionId(event.target.value)}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Navigation order
        <input
          type="number"
          min="0"
          step="1"
          value={order}
          disabled={state.blocked}
          onChange={(event) => setOrder(event.target.value)}
        />
      </label>
      <button type="submit" disabled={state.blocked}>
        {`Create ${noun}`}
      </button>
      {problem && <p role="alert">{problem}</p>}
      <CurationFeedback state={state} />
    </form>
  );
}
