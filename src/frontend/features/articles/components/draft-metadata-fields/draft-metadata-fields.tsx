import type { DraftInput } from "@/shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
import styles from "./draft-metadata-fields.module.css";
const fields = [
  {
    key: "title",
    label: "Title (required)",
    hint: "Up to 240 characters.",
    required: true,
  },
  {
    key: "excerpt",
    label: "Excerpt (optional)",
    hint: "Up to 600 characters.",
    required: false,
  },
  {
    key: "seoKeyphrase",
    label: "SEO keyphrase (optional)",
    hint: "Up to 160 characters.",
    required: false,
  },
  {
    key: "metaDescription",
    label: "Meta description (optional)",
    hint: "Up to 320 characters.",
    required: false,
  },
] as const;
export function DraftMetadataFields({
  draft,
  options,
  errors,
  onChange,
}: {
  draft: DraftInput;
  options: DraftOptions;
  errors: Record<string, string>;
  onChange: (draft: DraftInput) => void;
}) {
  return (
    <div className={styles.fields}>
      {fields.map(({ key, label, hint, required }) => {
        const Control =
          key === "excerpt" || key === "metaDescription" ? "textarea" : "input";
        return (
          <div key={key}>
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
    </div>
  );
}
