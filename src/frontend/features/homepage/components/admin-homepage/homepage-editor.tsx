"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublishedStoryCatalog } from "./published-story-catalog";
import { useDraftNavigationGuard } from "@/frontend/components/dashboard/draft-navigation-guard/draft-navigation-guard";
import type { AdminArticlePage } from "@/backend/articles/admin-article-queries/admin-article-queries";
import type {
  HomepageArticle,
  HomepageCuration,
} from "@/backend/homepage/homepage-curation/homepage-curation";
import { saveHomepageAction } from "@/backend/homepage/homepage-curation/homepage-actions";
import type {
  HomepageCommand,
  HomepageResult,
} from "@/shared/homepage/homepage-curation/homepage-command";

type Choices = {
  lead: HomepageArticle | null;
  featured: HomepageArticle[];
  readThis: HomepageArticle[];
};
function choiceKey(value: Choices) {
  return JSON.stringify([
    value.lead?.id ?? null,
    value.featured.map((item) => item.id),
    value.readThis.map((item) => item.id),
  ]);
}
const messages = {
  invalid_input:
    "Select distinct published stories within the slot limits. Remove archived selections before saving.",
  forbidden: "Your administrator access no longer permits this change.",
  conflict:
    "Homepage selections changed elsewhere. Reload to review the latest version.",
  request_conflict:
    "This request cannot be reused. Reload homepage selections.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
};
export function HomepageEditor({
  curation,
  candidates,
  search,
  hasCursor = false,
}: {
  curation: HomepageCuration;
  candidates: AdminArticlePage;
  search: string;
  hasCursor?: boolean;
}) {
  const router = useRouter();
  const [choices, setChoices] = useState<Choices>(curation.saved);
  const [version, setVersion] = useState(curation.version);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<HomepageResult | null>(null);
  const [retry, setRetry] = useState<HomepageCommand | null>(null);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const [acknowledged, setAcknowledged] = useState(() =>
    choiceKey(curation.saved),
  );
  useDraftNavigationGuard(
    choiceKey(choices) !== acknowledged || pending || Boolean(retry),
  );
  const blocked = pending || Boolean(retry);
  const selected = [
    ...(choices.lead ? [choices.lead] : []),
    ...choices.featured,
    ...choices.readThis,
  ];
  function add(
    article: HomepageArticle,
    group: "lead" | "featured" | "readThis",
  ) {
    if (blocked) return;
    if (selected.some((item) => item.id === article.id)) {
      setNotice("A story can appear only once.");
      return;
    }
    if (group !== "lead" && choices[group].length >= 4) {
      setNotice("Each group can contain up to four stories.");
      return;
    }
    setNotice("");
    setResult(null);
    setChoices((current) =>
      group === "lead"
        ? { ...current, lead: article }
        : { ...current, [group]: [...current[group], article] },
    );
  }
  function remove(group: "lead" | "featured" | "readThis", index: number) {
    if (blocked) return;
    setChoices((current) =>
      group === "lead"
        ? { ...current, lead: null }
        : { ...current, [group]: current[group].filter((_, i) => i !== index) },
    );
    setResult(null);
  }
  function move(group: "featured" | "readThis", index: number, offset: number) {
    if (blocked) return;
    setChoices((current) => {
      const items = [...current[group]];
      const target = index + offset;
      if (target < 0 || target >= items.length) return current;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, [group]: items };
    });
    setResult(null);
  }
  async function run(command: HomepageCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: HomepageResult;
    try {
      next = await saveHomepageAction(command);
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
      setAcknowledged(
        JSON.stringify([command.lead, command.featured, command.readThis]),
      );
      setVersion(next.version);
      router.refresh();
    }
  }
  function save() {
    if (blocked) return;
    if (selected.some((item) => item.status !== "published")) {
      setResult({ ok: false, code: "invalid_input" });
      return;
    }
    void run({
      expectedVersion: version,
      requestId: crypto.randomUUID(),
      lead: choices.lead?.id ?? null,
      featured: choices.featured.map((item) => item.id),
      readThis: choices.readThis.map((item) => item.id),
    });
  }
  function showGroup(title: string, group: "featured" | "readThis") {
    return (
      <section aria-label={title}>
        <h2>
          {title} ({choices[group].length}/4)
        </h2>
        {choices[group].length === 0 ? (
          <p>No curated stories.</p>
        ) : (
          <ol>
            {choices[group].map((item, index) => (
              <li key={item.id}>
                {item.title}{" "}
                {item.status !== "published" && (
                  <strong>({item.status}; remove before saving)</strong>
                )}
                <button
                  type="button"
                  disabled={blocked || index === 0}
                  onClick={() => move(group, index, -1)}
                  aria-label={`Move ${item.title} up in ${title}`}
                >
                  Move up
                </button>
                <button
                  type="button"
                  disabled={blocked || index === choices[group].length - 1}
                  onClick={() => move(group, index, 1)}
                  aria-label={`Move ${item.title} down in ${title}`}
                >
                  Move down
                </button>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => remove(group, index)}
                  aria-label={`Remove ${item.title} from ${title}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }
  return (
    <>
      <p>
        Choose a lead and up to four stories per group. Each story can appear
        once. Gaps use the newest published stories.
      </p>
      <section aria-label="Lead story">
        <h2>Lead story</h2>
        {choices.lead ? (
          <p>
            {choices.lead.title}{" "}
            {choices.lead.status !== "published" && (
              <strong>({choices.lead.status}; remove before saving)</strong>
            )}
            <button
              type="button"
              disabled={blocked}
              onClick={() => remove("lead", 0)}
            >
              Remove lead
            </button>
          </p>
        ) : (
          <p>No curated lead.</p>
        )}
      </section>
      {showGroup("Featured News", "featured")}
      {showGroup("Read This", "readThis")}
      <button type="button" disabled={blocked} onClick={save}>
        Save homepage selections
      </button>
      {pending && <p role="status">Saving selections…</p>}
      {result?.ok && <p role="status">Homepage selections saved.</p>}
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
          {["conflict", "request_conflict", "invalid_input"].includes(
            result.code,
          ) && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Reload homepage selections? Unsaved changes will be lost.",
                  )
                )
                  window.location.reload();
              }}
            >
              Reload selections
            </button>
          )}
        </div>
      )}
      <section aria-label="Current saved homepage preview">
        <h2>Current saved preview</h2>
        <p>Lead: {curation.effective.lead?.title ?? "No published stories"}</p>
        <p>
          Featured News:{" "}
          {curation.effective.featured.map((a) => a.title).join(", ") || "None"}
        </p>
        <p>
          Read This:{" "}
          {curation.effective.readThis.map((a) => a.title).join(", ") || "None"}
        </p>
      </section>
      <PublishedStoryCatalog
        candidates={candidates}
        search={search}
        hasCursor={hasCursor}
        blocked={blocked}
        selectedIds={selected.map((item) => item.id)}
        featuredCount={choices.featured.length}
        readCount={choices.readThis.length}
        notice={notice}
        setNotice={setNotice}
        add={add}
      />
      <noscript>Enable JavaScript to manage homepage selections.</noscript>
    </>
  );
}
