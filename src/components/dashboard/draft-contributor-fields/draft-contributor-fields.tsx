import type {
  DraftInput,
  DraftContributor,
} from "@/lib/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/lib/articles/draft-options/draft-options";
import { Button } from "@/components/ui/button/button";
import styles from "./draft-contributor-fields.module.css";
export function DraftContributorFields({
  value,
  options,
  error,
  onChange,
}: {
  value: DraftInput["contributors"];
  options: DraftOptions["contributors"];
  error?: string;
  onChange: (value: DraftInput["contributors"]) => void;
}) {
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
        Up to 32 credits. A contributor may have different roles. Matching
        display orders are allowed. Credits do not grant editing access.
      </p>
      {!options.length && <p>No active contributors are available.</p>}
      {value.map((credit, index) => (
        <div key={index} className={styles.credit}>
          <label htmlFor={`credit-${index}-profile`}>
            Contributor {index + 1}
          </label>
          <select
            id={`credit-${index}-profile`}
            value={credit.profileId}
            onChange={(e) => update(index, { profileId: e.target.value })}
          >
            {!options.some((p) => p.id === credit.profileId) && (
              <option value={credit.profileId}>
                Unavailable contributor: {credit.profileId}
              </option>
            )}
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.slug})
              </option>
            ))}
          </select>
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
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            Remove contributor {index + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        disabled={!options.length || value.length >= 32}
        onClick={() =>
          onChange([
            ...value,
            { profileId: options[0].id, role: "writer", displayOrder: 0 },
          ])
        }
      >
        Add contributor
      </Button>
      {error && <p id="draft-contributors-error">{error}</p>}
    </fieldset>
  );
}
