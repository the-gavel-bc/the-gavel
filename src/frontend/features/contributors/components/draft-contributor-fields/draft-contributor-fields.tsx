import { useLayoutEffect, useRef, useState } from "react";
import { ContributorCombobox } from "./contributor-combobox";
import type {
  DraftInput,
  DraftContributor,
} from "@/shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
import { Button } from "@/frontend/components/ui/button/button";
import { MAX_CONTRIBUTORS } from "@/frontend/features/articles/draft-selections/draft-selections";
import styles from "./draft-contributor-fields.module.css";
type Credits = DraftInput["contributors"];
export function DraftContributorFields({
  value,
  options,
  error,
  onChange,
  onOption,
}: {
  value: Credits;
  options: DraftOptions["contributors"];
  error?: string;
  onChange: (update: (current: Credits) => Credits) => void;
  onOption?: (contributor: DraftOptions["contributors"][number]) => void;
}) {
  const [added, setAdded] = useState<DraftOptions["contributors"]>([]);
  const [keys, setKeys] = useState(() =>
    value.map((_, index) => `initial-${index}`),
  );
  const nextKey = useRef(0);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const focusKey = useRef<string | null>(null);
  const [notice, setNotice] = useState<{
    sequence: number;
    message: string;
  } | null>(null);
  const currentKeys = useRef(keys);
  function replaceKeys(next: string[]) {
    currentKeys.current = next;
    setKeys(next);
  }
  function announce(message: string) {
    setNotice((previous) => ({
      sequence: (previous?.sequence ?? 0) + 1,
      message,
    }));
  }
  const rowKey = (index: number) => keys[index] ?? `external-${index}`;

  useLayoutEffect(() => {
    const key = focusKey.current;
    if (!key) return;
    focusKey.current = null;
    const target = fieldset.current?.querySelector<HTMLElement>(
      key === "add" ? "[data-add-contributor]" : `[data-credit-key="${key}"]`,
    );
    (
      target?.querySelector<HTMLInputElement>("input:not(:disabled)") ?? target
    )?.focus();
  });
  const choices = [
    ...options,
    ...added.filter((p) => !options.some((option) => option.id === p.id)),
  ];
  function update(key: string, patch: Partial<DraftContributor>) {
    const index = currentKeys.current.indexOf(key);
    if (index < 0) return;
    onChange((current) =>
      current.map((credit, i) =>
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
  const renumbered = (indices: number[], from: Credits) =>
    from.map((credit, i) => ({ ...credit, displayOrder: indices.indexOf(i) }));
  function move(position: number, offset: -1 | 1) {
    const next = [...order];
    [next[position], next[position + offset]] = [
      next[position + offset],
      next[position],
    ];
    focusKey.current = rowKey(order[position]);
    announce(`Contributor moved to position ${position + offset + 1}.`);
    onChange((current) => renumbered(next, current));
  }
  function remove(index: number) {
    const position = order.indexOf(index);
    const remainingOrder = order.filter((i) => i !== index);
    const nearest =
      remainingOrder[Math.min(position, remainingOrder.length - 1)];
    focusKey.current = nearest === undefined ? "add" : rowKey(nearest);
    announce(`Contributor ${position + 1} removed.`);
    replaceKeys(value.map((_, i) => rowKey(i)).filter((_, i) => i !== index));
    onChange((current) =>
      renumbered(
        remainingOrder.map((i) => (i > index ? i - 1 : i)),
        current.filter((_, i) => i !== index),
      ),
    );
  }
  return (
    <fieldset
      ref={fieldset}
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
          const key = rowKey(index);
          return (
            <div
              key={key}
              data-credit-key={key}
              tabIndex={-1}
              className={styles.credit}
            >
              <span className={styles.badge} aria-hidden="true">
                {position + 1}
              </span>
              <ContributorCombobox
                index={position}
                selected={
                  credit.profileId
                    ? (choices.find((p) => p.id === credit.profileId) ?? {
                        id: credit.profileId,
                        displayName: "Unavailable contributor",
                        slug: "",
                      })
                    : null
                }
                onSelect={(choice) => {
                  onOption?.(choice);
                  setAdded((rows) =>
                    rows.some((p) => p.id === choice.id)
                      ? rows
                      : [...rows, choice],
                  );
                  update(key, { profileId: choice.id });
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
                    update(key, {
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
        data-add-contributor=""
        disabled={value.length >= MAX_CONTRIBUTORS}
        title={
          value.length >= MAX_CONTRIBUTORS
            ? `Up to ${MAX_CONTRIBUTORS} contributors.`
            : undefined
        }
        onClick={() => {
          const key = `added-${nextKey.current++}`;
          focusKey.current = key;
          replaceKeys([...value.map((_, index) => rowKey(index)), key]);
          const created: DraftContributor = {
            profileId: "",
            role: "writer",
            displayOrder: value.length,
          };
          onChange((current) =>
            renumbered([...order, current.length], [...current, created]),
          );
        }}
      >
        Add contributor
      </Button>
      <p role="status" className={styles.srOnly}>
        {notice && <span key={notice.sequence}>{notice.message}</span>}
      </p>
      {error && <p id="draft-contributors-error">{error}</p>}
    </fieldset>
  );
}
