import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  createGuestContributorAction,
  searchContributorsAction,
} from "@/backend/contributors/guest-contributor/guest-contributor-actions";
import {
  contributorNameSchema,
  type ContributorChoice,
  type GuestContributorCommand,
} from "@/shared/contributors/guest-contributor/guest-contributor";
import styles from "./draft-contributor-fields.module.css";

export function ContributorCombobox({
  index,
  selected,
  onSelect,
}: {
  index: number;
  selected: ContributorChoice;
  onSelect: (choice: ContributorChoice) => void;
}) {
  const id = useId();
  const label = `${selected.displayName} (${selected.slug})`;
  const [text, setText] = useState(label);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ContributorChoice[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [command, setCommand] = useState<GuestContributorCommand | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const latest = useRef({ selected, onSelect });
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    latest.current = { selected, onSelect };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [previousLabel, setPreviousLabel] = useState(label);
  if (previousLabel !== label) {
    setPreviousLabel(label);
    setText(label);
    setQuery("");
    setOpen(false);
    setCommand(null);
    setError("");
  }
  useEffect(() => {
    let cancelled = false;
    const normalized = contributorNameSchema.safeParse(query);
    if (!normalized.success) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchContributorsAction(normalized.data);
        if (cancelled) return;
        if (result.ok) {
          setItems(result.items);
          setError("");
        } else {
          setItems([]);
          setError(
            "Unable to search contributors. Change the search to retry.",
          );
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setError(
            "Unable to search contributors. Change the search to retry.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  const name = contributorNameSchema.safeParse(query);
  const canCreate =
    name.success &&
    !loading &&
    !items.some((p) => p.displayName.toLowerCase() === name.data.toLowerCase());
  const count = items.length + (canCreate ? 1 : 0);
  function select(choice: ContributorChoice) {
    setText(`${choice.displayName} (${choice.slug})`);
    setQuery("");
    setOpen(false);
    setError("");
    latest.current.onSelect(choice);
  }
  async function create(retry?: GuestContributorCommand) {
    if (inFlight.current || (!retry && !name.success)) return;
    const next = retry ?? {
      requestId: crypto.randomUUID(),
      displayName: name.success ? name.data : "",
    };
    const originalId = latest.current.selected.id;
    inFlight.current = true;
    setCommand(next);
    setCreating(true);
    setOpen(false);
    setError("");
    try {
      const result = await createGuestContributorAction(next);
      if (!mounted.current || latest.current.selected.id !== originalId) return;
      if (result.ok) {
        setCommand(null);
        select(result);
        setNotice("One-off credit added. It appears only on this article.");
      } else if (result.code === "unavailable") {
        setError(
          "Creation could not be confirmed. Retry the same contributor request.",
        );
      } else {
        setCommand(null);
        setError(
          result.code === "rate_limited"
            ? "Too many requests. Try again in a minute."
            : "Unable to create contributor. Review the name and try again.",
        );
      }
    } catch {
      if (mounted.current)
        setError(
          "Creation could not be confirmed. Retry the same contributor request.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setCreating(false);
    }
  }
  function choose(position: number) {
    if (position < items.length) select(items[position]);
    else if (canCreate) void create();
  }
  return (
    <div className={styles.combobox}>
      <label htmlFor={id}>Contributor {index + 1}</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={
          open && active >= 0 ? `${id}-option-${active}` : undefined
        }
        autoComplete="off"
        maxLength={120}
        value={text}
        disabled={creating || Boolean(command)}
        onChange={(e) => {
          setText(e.target.value);
          setQuery(e.target.value);
          setItems([]);
          setLoading(Boolean(e.target.value.trim()));
          setActive(-1);
          setOpen(true);
          setNotice("");
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((n) =>
              count
                ? (n + (e.key === "ArrowDown" ? 1 : -1) + count) % count
                : -1,
            );
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (active >= 0 && active < count) choose(active);
          }
        }}
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={`Contributor ${index + 1} results`}
          className={styles.results}
        >
          {items.map((item, n) => (
            <li key={item.id} role="presentation">
              <button
                type="button"
                role="option"
                id={`${id}-option-${n}`}
                aria-selected={active === n}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(item)}
              >
                {item.displayName} ({item.slug})
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="presentation">
              <button
                type="button"
                role="option"
                id={`${id}-option-${items.length}`}
                aria-selected={active === items.length}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void create()}
              >
                {`Add '${name.data}' as a one-off credit`}
              </button>
            </li>
          )}
        </ul>
      )}
      <p role="status" aria-live="polite">
        {creating
          ? "Adding credit…"
          : notice ||
            (loading
              ? "Searching contributors…"
              : open
                ? `${items.length} contributors found.`
                : "")}
      </p>
      {error && <p role="alert">{error}</p>}
      {command && !creating && (
        <button type="button" onClick={() => void create(command)}>
          Retry contributor creation
        </button>
      )}
    </div>
  );
}
