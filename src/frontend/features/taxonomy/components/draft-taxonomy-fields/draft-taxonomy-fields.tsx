import { useLayoutEffect, useRef, useState } from "react";
import { ensureTagAction } from "@/backend/taxonomy/ensure-tag/ensure-tag-action";
import { tagNameSchema } from "@/shared/taxonomy/ensure-tag/ensure-tag";
import type { DraftInput } from "@/shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
import styles from "./draft-taxonomy-fields.module.css";
export function DraftTaxonomyFields({
  draft,
  options,
  errors,
  onChange,
  onOption,
}: {
  draft: DraftInput;
  options: DraftOptions;
  errors: Record<string, string>;
  onChange: (draft: DraftInput) => void;
  onOption?: (tag: DraftOptions["tags"][number]) => void;
}) {
  const [text, setText] = useState("");
  const [added, setAdded] = useState<DraftOptions["tags"]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef({ draft, onChange, onOption });
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    latest.current = { draft, onChange, onOption };
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const tags = [
    ...options.tags,
    ...added.filter(
      (tag) => !options.tags.some((option) => option.id === tag.id),
    ),
  ];
  async function addTag() {
    if (inFlight.current || latest.current.draft.tagIds.length >= 10) return;
    const parsed = tagNameSchema.safeParse(text);
    if (!parsed.success) {
      setError("Enter a tag name between 1 and 120 characters.");
      return;
    }
    const existing = tags.find(
      (tag) => tag.name.toLowerCase() === parsed.data.toLowerCase(),
    );
    let tag = existing;
    setError("");
    if (!tag) {
      inFlight.current = true;
      setPending(true);
      try {
        const result = await ensureTagAction(parsed.data);
        if (!mounted.current) return;
        if (!result.ok) {
          setError(
            result.code === "rate_limited"
              ? "Too many requests. Try adding the tag again in a minute."
              : result.code === "conflict"
                ? "You can create up to 30 new tags per day. Choose an existing tag or try tomorrow."
                : "Unable to add tag. Try again.",
          );
          return;
        }
        tag = result;
        setAdded((rows) =>
          rows.some((row) => row.id === result.id) ? rows : [...rows, result],
        );
      } catch {
        if (mounted.current) setError("Unable to add tag. Try again.");
        return;
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    }
    const current = latest.current;
    current.onOption?.(tag);
    if (
      !current.draft.tagIds.includes(tag.id) &&
      current.draft.tagIds.length < 10
    ) {
      current.onChange({
        ...current.draft,
        tagIds: [...current.draft.tagIds, tag.id],
      });
    }
    setText("");
  }
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
        ] as const
      ).map(([field, label, choices, cap, singular]) => {
        const selected = draft[field];
        const unavailable = selected.filter(
          (id) => !choices.some((c) => c.id === id),
        );
        const rows = [
          ...choices,
          ...unavailable.map((id, index) => ({
            id,
            name: `Unavailable ${singular} ${index + 1}`,
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
              Up to {cap}, from the selected section.
            </p>
            {!rows.length && (
              <p>
                {draft.sectionId
                  ? `No ${label.toLowerCase()} are available for this section.`
                  : "Choose a section first."}
              </p>
            )}
            <div className={styles.choicesList}>
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
            </div>
            {errors[field] && (
              <p id={`draft-${field}-error`}>{errors[field]}</p>
            )}
          </fieldset>
        );
      })}
      <fieldset
        id="draft-tagIds"
        tabIndex={-1}
        aria-describedby="draft-tagIds-hint"
        aria-invalid={Boolean(errors.tagIds)}
      >
        <legend>Tags</legend>
        <p id="draft-tagIds-hint">
          Up to 10 tags. Press Enter or comma to add.
        </p>
        <ul className={styles.chips}>
          {draft.tagIds.map((id, index) => {
            const name =
              tags.find((tag) => tag.id === id)?.name ??
              `Unavailable tag ${index + 1}`;
            return (
              <li key={id}>
                {name}
                <button
                  type="button"
                  aria-label={`Remove tag ${name}`}
                  onClick={() =>
                    onChange({
                      ...draft,
                      tagIds: draft.tagIds.filter(
                        (selected) => selected !== id,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
        <label htmlFor="draft-tag-input">Add tag</label>
        <div className={styles.tagEntry}>
          <input
            id="draft-tag-input"
            list="draft-tag-options"
            value={text}
            disabled={pending || draft.tagIds.length >= 10}
            aria-describedby="draft-tagIds-hint"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (
                !event.nativeEvent.isComposing &&
                (event.key === "Enter" || event.key === ",")
              ) {
                event.preventDefault();
                void addTag();
              }
            }}
          />
          <button
            type="button"
            disabled={pending || draft.tagIds.length >= 10}
            onClick={() => void addTag()}
          >
            {pending ? "Adding tag…" : "Add tag"}
          </button>
        </div>
        <datalist id="draft-tag-options">
          {tags
            .filter((tag) => !draft.tagIds.includes(tag.id))
            .map((tag) => (
              <option key={tag.id} value={tag.name} />
            ))}
        </datalist>
        {(error || errors.tagIds) && (
          <p role="alert">{error || errors.tagIds}</p>
        )}
      </fieldset>
    </div>
  );
}
