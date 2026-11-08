"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TaxonomyItem } from "@/lib/taxonomy/admin-taxonomy/admin-taxonomy";
import { updateTaxonomyAction } from "@/lib/taxonomy/taxonomy-command/taxonomy-actions";
import type {
  TaxonomyCommand,
  TaxonomyResult,
} from "@/shared/taxonomy/taxonomy-command/taxonomy-command";

const messages = {
  invalid_input: "Check the name and navigation order.",
  forbidden: "Your administrator access no longer permits this change.",
  not_found: "This taxonomy item is no longer available.",
  conflict:
    "The item changed, is referenced, or its parent is inactive. Reload to review it.",
  request_conflict: "This request cannot be reused. Reload taxonomy.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
};
export function TaxonomyControls({
  item,
  kind,
}: {
  item: TaxonomyItem;
  kind: "section" | "category";
}) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [order, setOrder] = useState(String(item.navigationOrder ?? 0));
  const [active, setActive] = useState(item.active ?? false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TaxonomyResult | null>(null);
  const [retry, setRetry] = useState<TaxonomyCommand | null>(null);
  const busy = useRef(false);
  const blocked = pending || Boolean(retry) || Boolean(result?.ok);
  async function run(command: TaxonomyCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: TaxonomyResult;
    try {
      next = await updateTaxonomyAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetry(
      !next.ok && (next.code === "unavailable" || retry !== null)
        ? command
        : null,
    );
    setResult(next);
    setPending(false);
    busy.current = false;
    if (next.ok) {
      if (!next.changed) setResult(null);
      router.refresh();
    }
  }
  function save() {
    const value = Number(order);
    if (
      blocked ||
      item.version === null ||
      !name.trim() ||
      name !== name.trim() ||
      !/^\d+$/u.test(order) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 2147483647
    ) {
      setResult({ ok: false, code: "invalid_input" });
      return;
    }
    if (
      item.active &&
      !active &&
      !window.confirm(
        `Deactivate ${item.name}? Draft references remain but will need repair before saving.`,
      )
    )
      return;
    void run({
      kind,
      id: item.id,
      expectedVersion: item.version,
      requestId: crypto.randomUUID(),
      name,
      navigationOrder: value,
      active,
    });
  }
  const labelLocked =
    kind === "category" && item.name.toLowerCase() === "outside of bc";
  return (
    <section aria-label={`Manage ${item.name}`}>
      <label>
        Name
        <input
          value={name}
          maxLength={120}
          disabled={blocked || labelLocked}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {labelLocked && <p>This category name awaits confirmation.</p>}
      <label>
        Navigation order
        <input
          type="number"
          min="0"
          max="2147483647"
          step="1"
          value={order}
          disabled={blocked}
          onChange={(event) => setOrder(event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={active}
          disabled={blocked || (item.active === true && item.referencedLive)}
          onChange={(event) => setActive(event.target.checked)}
        />
        Active
      </label>
      {item.referencedLive && (
        <p>Published or archived references prevent deactivation.</p>
      )}
      <button type="button" onClick={save} disabled={blocked}>
        Save {item.name}
      </button>
      {pending && <p role="status">Saving taxonomy…</p>}
      {result?.ok && <p role="status">Taxonomy saved. Refreshing…</p>}
      {result && !result.ok && (
        <div role="alert">
          <p>{messages[result.code]}</p>
          {retry && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void run(retry)}
            >
              Retry original request
            </button>
          )}
          {["conflict", "not_found", "request_conflict"].includes(
            result.code,
          ) && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                router.refresh();
              }}
            >
              Reload taxonomy
            </button>
          )}
        </div>
      )}
      <noscript>Enable JavaScript to manage taxonomy.</noscript>
    </section>
  );
}
