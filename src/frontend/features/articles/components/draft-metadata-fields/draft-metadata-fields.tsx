import type { ReactNode } from "react";
import type { DraftInput } from "@/shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
import styles from "./draft-metadata-fields.module.css";
const fields = [
  {
    key: "title",
    label: "Title (required)",
    hint: "Max 240.",
    required: true,
  },
  {
    key: "excerpt",
    label: "Excerpt (optional)",
    hint: "Max 600.",
    required: false,
  },
  {
    key: "seoKeyphrase",
    label: "SEO keyphrase (optional)",
    hint: "Max 160.",
    required: false,
  },
  {
    key: "metaDescription",
    label: "Meta description (optional)",
    hint: "Max 320.",
    required: false,
  },
] as const;
type Key = (typeof fields)[number]["key"];
type Common = {
  draft: DraftInput;
  errors: Record<string, string>;
  onChange: (draft: DraftInput) => void;
};

function TextFields({
  draft,
  errors,
  onChange,
  keys,
  children,
}: Common & { keys: Key[]; children?: ReactNode }) {
  return (
    <div className={styles.fields}>
      {fields
        .filter((field) => keys.includes(field.key))
        .map(({ key, label, hint, required }) => {
          const Control =
            key === "excerpt" || key === "metaDescription"
              ? "textarea"
              : "input";
          return (
            <div key={key} data-wide>
              <label htmlFor={`draft-${key}`}>{label}</label>
              <Control
                id={`draft-${key}`}
                value={draft[key] ?? ""}
                required={required}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={`draft-${key}-hint${errors[key] ? ` draft-${key}-error` : ""}`}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    [key]:
                      !required && event.target.value === ""
                        ? null
                        : event.target.value,
                  })
                }
              />
              <p id={`draft-${key}-hint`} className={styles.hint}>
                {hint}
              </p>
              {errors[key] && <p id={`draft-${key}-error`}>{errors[key]}</p>}
            </div>
          );
        })}
      {children}
    </div>
  );
}

// Title, excerpt and section: the details that stay at the top of the editor.
export function DraftMetadataFields({
  options,
  ...common
}: Common & { options: DraftOptions }) {
  const { draft, errors, onChange } = common;
  return (
    <TextFields {...common} keys={["title", "excerpt"]}>
      <div>
        <label htmlFor="draft-sectionId">Section (required)</label>
        <select
          id="draft-sectionId"
          value={draft.sectionId}
          required
          aria-invalid={Boolean(errors.sectionId)}
          aria-describedby={
            errors.sectionId ? "draft-sectionId-error" : undefined
          }
          onChange={(event) =>
            onChange({ ...draft, sectionId: event.target.value })
          }
        >
          <option value="">Choose a section</option>
          {draft.sectionId &&
            !options.sections.some((s) => s.id === draft.sectionId) && (
              <option value={draft.sectionId}>
                Unavailable section: {draft.sectionId}
              </option>
            )}
          {options.sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
        {errors.sectionId && (
          <p id="draft-sectionId-error">{errors.sectionId}</p>
        )}
      </div>
    </TextFields>
  );
}

// Search details come last in the editor, after the image.
export function DraftSeoFields(common: Common) {
  return <TextFields {...common} keys={["seoKeyphrase", "metaDescription"]} />;
}
