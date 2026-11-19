import { useRef, useState } from "react";
import { ContributorCombobox } from "./contributor-combobox";
import type {
  DraftInput,
  DraftContributor,
} from "@/shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
import { Button } from "@/frontend/components/ui/button/button";
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
  return (
    <fieldset
      id="draft-contributors"
      tabIndex={-1}
      className={styles.fields}
      aria-invalid={Boolean(error)}
      aria-describedby={`draft-contributors-hint${error ? " draft-contributors-error" : ""}`}
    >
      <legend>Contributors</legend>
      <p id="draft-contributors-hint">
        Up to 32 credits. Search for staff, or type a name to add a one-off
        credit that appears only on this article. Credits do not grant editing
        access.
      </p>
      {value.map((credit, index) => (
        <div key={keys[index] ?? `external-${index}`} className={styles.credit}>
          <ContributorCombobox
            index={index}
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
                rows.some((p) => p.id === choice.id) ? rows : [...rows, choice],
              );
              update(index, { profileId: choice.id });
            }}
          />
          <label htmlFor={`credit-${index}-role`}>Role {index + 1}</label>
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
          <label htmlFor={`credit-${index}-order`}>
            Display order {index + 1}
          </label>
          <input
            id={`credit-${index}-order`}
            type="number"
            min={0}
            max={2147483647}
            step={1}
            value={Number.isNaN(credit.displayOrder) ? "" : credit.displayOrder}
            onChange={(e) =>
              update(index, {
                displayOrder:
                  e.target.value === "" ? NaN : Number(e.target.value),
              })
            }
          />
          <Button
            type="button"
            onClick={() => {
              setKeys((rows) => rows.filter((_, i) => i !== index));
              onChange(value.filter((_, i) => i !== index));
            }}
          >
            Remove contributor {index + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        disabled={value.length >= 32}
        onClick={() => {
          setKeys((rows) => [...rows, `added-${nextKey.current++}`]);
          onChange([
            ...value,
            {
              profileId: options[0]?.id ?? "",
              role: "writer",
              displayOrder: 0,
            },
          ]);
        }}
      >
        Add contributor
      </Button>
      {error && <p id="draft-contributors-error">{error}</p>}
    </fieldset>
  );
}
