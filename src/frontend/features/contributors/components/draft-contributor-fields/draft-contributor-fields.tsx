import { useRef, useState } from "react";
import { ContributorCombobox } from "./contributor-combobox";
import type {
  DraftInput,
  DraftContributor,
} from "@/shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
import { Button } from "@/frontend/components/ui/button/button";
import { MAX_CONTRIBUTORS } from "@/frontend/features/articles/draft-selections/draft-selections";
import styles from "./draft-contributor-fields.module.css";
export function DraftContributorFields({
  value,
  options,
  error,
  onChange,
  onOption,
}: {
  value: DraftInput["contributors"];
  options: DraftOptions["contributors"];
  error?: string;
  onChange: (value: DraftInput["contributors"]) => void;
  onOption?: (contributor: DraftOptions["contributors"][number]) => void;
}) {
  const [added, setAdded] = useState<DraftOptions["contributors"]>([]);
  const [keys, setKeys] = useState(() =>
    value.map((_, index) => `initial-${index}`),
  );
  const nextKey = useRef(0);
  const choices = [
    ...options,
    ...added.filter((p) => !options.some((option) => option.id === p.id)),
  ];
  function update(index: number, patch: Partial<DraftContributor>) {
    onChange(
      value.map((credit, i) =>
        i === index ? { ...credit, ...patch } : credit,
      ),
    );
  }
  // Credits appear in the order of their position: the top one is first. The
  // stored display order is just that position, renumbered on every change.
  const order = value
    .map((_, index) => index)
    .sort(
      (a, b) =>
        (Number.isNaN(value[a].displayOrder)
          ? Infinity
          : value[a].displayOrder) -
          (Number.isNaN(value[b].displayOrder)
            ? Infinity
            : value[b].displayOrder) || a - b,
    );
  const renumbered = (indices: number[], from: DraftContributor[] = value) =>
    from.map((credit, i) => ({ ...credit, displayOrder: indices.indexOf(i) }));
  function move(position: number, offset: -1 | 1) {
    const next = [...order];
    [next[position], next[position + offset]] = [
      next[position + offset],
      next[position],
    ];
    onChange(renumbered(next));
  }
  function remove(index: number) {
    setKeys((rows) => rows.filter((_, i) => i !== index));
    const remaining = value.filter((_, i) => i !== index);
    const next = order
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i));
    onChange(renumbered(next, remaining));
  }
  return (
    <fieldset
      id="draft-contributors"
      tabIndex={-1}
      className={styles.fields}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? "draft-contributors-error" : undefined}
    >
      <legend>Contributors</legend>
      <div className={styles.body}>
        {order.map((index, position) => {
          const credit = value[index];
          return (
            <div
              key={keys[index] ?? `external-${index}`}
              className={styles.credit}
            >
              <span className={styles.badge} aria-hidden="true">
                {position + 1}
              </span>
              <ContributorCombobox
                index={position}
                selected={
                  choices.find((p) => p.id === credit.profileId) ?? {
                    id: credit.profileId,
                    displayName: `Unavailable contributor: ${credit.profileId}`,
                    slug: "unavailable",
                  }
                }
                onSelect={(choice) => {
                  onOption?.(choice);
                  setAdded((rows) =>
                    rows.some((p) => p.id === choice.id)
                      ? rows
                      : [...rows, choice],
                  );
                  update(index, { profileId: choice.id });
                }}
              />
              <div className={styles.field}>
                <label htmlFor={`credit-${index}-role`}>
                  Role <span className={styles.srOnly}>{position + 1}</span>
                </label>
                <select
                  id={`credit-${index}-role`}
                  value={credit.role}
                  onChange={(e) =>
                    update(index, {
                      role: e.target.value as DraftContributor["role"],
                    })
                  }
                >
                  <option value="writer">Writer</option>
                  <option value="editor">Editor</option>
                  <option value="creative">Creative</option>
                </select>
              </div>
              <div className={styles.shift}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={position === 0}
                  aria-label={`Move contributor ${position + 1} up`}
                  onClick={() => move(position, -1)}
                >
                  <span aria-hidden="true">↑</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={position === order.length - 1}
                  aria-label={`Move contributor ${position + 1} down`}
                  onClick={() => move(position, 1)}
                >
                  <span aria-hidden="true">↓</span>
                </Button>
              </div>
              <Button
                type="button"
                variant="danger"
                aria-label={`Remove contributor ${position + 1}`}
                onClick={() => remove(index)}
              >
                Remove
              </Button>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={value.length >= MAX_CONTRIBUTORS}
        title={
          value.length >= MAX_CONTRIBUTORS
            ? `Up to ${MAX_CONTRIBUTORS} contributors.`
            : undefined
        }
        onClick={() => {
          setKeys((rows) => [...rows, `added-${nextKey.current++}`]);
          const created: DraftContributor = {
            profileId: options[0]?.id ?? "",
            role: "writer",
            displayOrder: value.length,
          };
          onChange(renumbered([...order, value.length], [...value, created]));
        }}
      >
        Add contributor
      </Button>
      {error && <p id="draft-contributors-error">{error}</p>}
    </fieldset>
  );
}
