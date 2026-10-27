import type { DraftInput } from "@/lib/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/lib/articles/draft-options/draft-options";
import styles from "./draft-taxonomy-fields.module.css";
export function DraftTaxonomyFields({
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
      {(
        [
          [
            "categoryIds",
            "Categories",
            options.categories.filter((c) => c.sectionId === draft.sectionId),
            32,
            "category",
          ],
          ["tagIds", "Tags", options.tags, 64, "tag"],
        ] as const
      ).map(([field, label, choices, cap, singular]) => {
        const selected = draft[field];
        const unavailable = selected.filter(
          (id) => !choices.some((c) => c.id === id),
        );
        const rows = [
          ...choices,
          ...unavailable.map((id) => ({
            id,
            name: `Unavailable ${singular}: ${id}`,
          })),
        ];
        return (
          <fieldset
            key={field}
            id={`draft-${field}`}
            tabIndex={-1}
            aria-invalid={Boolean(errors[field])}
            aria-describedby={`draft-${field}-hint${errors[field] ? ` draft-${field}-error` : ""}`}
          >
            <legend>{label}</legend>
            <p id={`draft-${field}-hint`}>
              Choose up to {cap}.{" "}
              {field === "categoryIds"
                ? "Categories must match the selected section. Changing section keeps existing selections until you remove them."
                : "Choose existing tags."}
            </p>
            {!rows.length && <p>No {label.toLowerCase()} are available.</p>}
            {rows.map((row) => (
              <label key={row.id} className={styles.choice}>
                <input
                  type="checkbox"
                  checked={selected.includes(row.id)}
                  disabled={
                    selected.length >= cap && !selected.includes(row.id)
                  }
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      [field]: e.target.checked
                        ? [...selected, row.id]
                        : selected.filter((id) => id !== row.id),
                    })
                  }
                />
                {row.name}
              </label>
            ))}
            {errors[field] && (
              <p id={`draft-${field}-error`}>{errors[field]}</p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
