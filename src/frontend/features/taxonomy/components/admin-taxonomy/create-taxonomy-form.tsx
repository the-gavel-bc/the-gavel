"use client";
import { useFieldErrors } from "@/frontend/components/ui/field-errors/use-field-errors";
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
  const fields = useFieldErrors();
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [order, setOrder] = useState(String(nextOrder));
  const [withCategory, setWithCategory] = useState(false);
  const [firstCategory, setFirstCategory] = useState("");
  const [note, setNote] = useState("");
  const state = useCuration(() => {
    setName("");
    setFirstCategory("");
    setWithCategory(false);
  });
  const noun = kind === "section" ? "section" : "category";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.blocked) return;
    const value = Number(order);
    const category = withCategory ? firstCategory : "";
    const errors: Record<string, string> = {};
    if (!name.trim() || name !== name.trim())
      errors.name = "Enter a name without leading or trailing spaces.";
    if (kind === "category" && !sectionId)
      errors.sectionId = "Select a section for this category.";
    if (!/^\d+$/u.test(order) || value > 2147483647)
      errors.order = "Enter a whole navigation order from 0 to 2,147,483,647.";
    if (withCategory && (!category.trim() || category !== category.trim()))
      errors.firstCategory =
        "Enter a first category name without leading or trailing spaces.";
    if (Object.keys(errors).length) {
      fields.show(event.currentTarget, errors);
      return;
    }
    setNote("");
    const base = {
      requestId: crypto.randomUUID(),
      name,
      navigationOrder: value,
    };
    if (kind === "category") {
      const made = await state.run({
        kind: "createCategory",
        ...base,
        sectionId,
      });
      if (made?.ok) setNote(`Category "${name}" created.`);
      return;
    }
    const created = await state.run({ kind: "createSection", ...base });
    // The section exists now; add its first category as a second step so a
    // failure here never hides that the section was created.
    if (created?.ok && !category) setNote(`Section "${name}" created.`);
    if (created?.ok && created.id && category) {
      setNote(`Section "${name}" created.`);
      const made = await state.run({
        kind: "createCategory",
        requestId: crypto.randomUUID(),
        name: category,
        navigationOrder: 0,
        sectionId: created.id,
      });
      if (made?.ok)
        setNote(`Section "${name}" and category "${category}" created.`);
    }
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className={list.toolbar}
      aria-label={`New ${noun}`}
    >
      <label>
        {`New ${noun} name`}
        <input
          {...fields.input("name")}
          value={name}
          maxLength={120}
          disabled={state.blocked}
          onChange={(event) => {
            setName(event.target.value);
            fields.clear("name");
            setNote("");
          }}
        />
      </label>
      {kind === "category" && (
        <label>
          Section
          <select
            {...fields.input("sectionId")}
            value={sectionId}
            disabled={state.blocked}
            onChange={(event) => {
              setSectionId(event.target.value);
              fields.clear("sectionId");
            }}
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
          {...fields.input("order")}
          value={order}
          disabled={state.blocked}
          onChange={(event) => {
            setOrder(event.target.value);
            fields.clear("order");
          }}
        />
      </label>
      {kind === "section" && (
        <>
          <label className={list.inline}>
            <input
              type="checkbox"
              checked={withCategory}
              disabled={state.blocked}
              onChange={(event) => {
                setWithCategory(event.target.checked);
                fields.clear("firstCategory");
              }}
            />
            Also create a first category
          </label>
          {withCategory && (
            <label>
              First category name
              <input
                {...fields.input("firstCategory")}
                value={firstCategory}
                maxLength={120}
                disabled={state.blocked}
                onChange={(event) => {
                  setFirstCategory(event.target.value);
                  fields.clear("firstCategory");
                }}
              />
            </label>
          )}
        </>
      )}
      <button type="submit" disabled={state.blocked}>
        {`Create ${noun}`}
      </button>
      {fields.messages}
      {note && <p role="status">{note}</p>}
      <CurationFeedback state={state} showSaved={false} />
    </form>
  );
}
