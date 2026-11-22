"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraftNavigationGuard } from "@/frontend/components/dashboard/draft-navigation-guard/draft-navigation-guard";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { Button } from "@/frontend/components/ui/button/button";
import type { LibraryPage } from "@/backend/homepage/homepage-curation/homepage-stories-action";
import { saveHomepageAction } from "@/backend/homepage/homepage-curation/homepage-actions";
import type {
  HomepageCommand,
  HomepageResult,
} from "@/shared/homepage/homepage-curation/homepage-command";
import {
  addStory,
  choiceKey,
  groupLabel,
  placeStory,
  removeStory,
  ROW_LIMIT,
  selectedStories,
  shiftStory,
  type Choices,
  type Group,
  type Place,
  type RowGroup,
  type Story,
} from "./homepage-arrangement";
import { SlotBoard } from "./slot-board";
import { StoryLibrary } from "./story-library";
import type { DragHandlers, DragState } from "./story-card";
import styles from "./homepage-editor.module.css";

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
  version: initialVersion,
  saved,
  library,
}: {
  version: number;
  saved: Choices;
  library: LibraryPage;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [choices, setChoices] = useState<Choices>(saved);
  // What is saved on the server; Discard returns here.
  const [baseline, setBaseline] = useState<Choices>(saved);
  const [version, setVersion] = useState(initialVersion);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<HomepageResult | null>(null);
  const [retry, setRetry] = useState<HomepageCommand | null>(null);
  const [notice, setNotice] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [drag, setDrag] = useState<DragState>(null);
  // The ref is what drop reads: a drop can arrive before the state update
  // from dragstart has rendered.
  const dragRef = useRef<DragState>(null);
  const busy = useRef(false);
  const dirty = choiceKey(choices) !== choiceKey(baseline);
  useDraftNavigationGuard(dirty || pending || Boolean(retry));
  const blocked = pending || Boolean(retry);
  const selected = selectedStories(choices);

  function apply(outcome: { choices: Choices; error?: string }, said: string) {
    if (outcome.error) {
      setNotice(outcome.error);
      return;
    }
    setNotice("");
    setResult(null);
    setChoices(outcome.choices);
    setAnnouncement(said);
  }
  function add(story: Story, group: Group) {
    if (blocked) return;
    apply(
      addStory(choices, story, group),
      `${story.title} added to ${groupLabel[group]}.`,
    );
  }
  function remove(group: Group, index: number) {
    if (blocked) return;
    const story = group === "lead" ? choices.lead : choices[group][index];
    setNotice("");
    setResult(null);
    setChoices(removeStory(choices, group, index));
    if (story)
      setAnnouncement(`${story.title} removed from ${groupLabel[group]}.`);
  }
  function shift(group: RowGroup, index: number, offset: -1 | 1) {
    if (blocked) return;
    const next = shiftStory(choices, group, index, offset);
    if (next === choices) return;
    setResult(null);
    setChoices(next);
    setAnnouncement(
      `${choices[group][index].title} moved ${offset < 0 ? "left" : "right"} to position ${index + offset + 1} of ${choices[group].length} in ${groupLabel[group]}.`,
    );
  }
  const handlers: DragHandlers = {
    start: (story, from) => {
      dragRef.current = { story, from };
      setDrag({ story, from });
    },
    end: () => {
      dragRef.current = null;
      setDrag(null);
    },
    drop: (to: Place) => {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current || blocked) return;
      apply(
        placeStory(choices, current.story, current.from, to),
        `${current.story.title} placed in ${groupLabel[to.group]}.`,
      );
    },
  };

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
      setBaseline(choices);
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
  function discard() {
    if (blocked) return;
    setChoices(baseline);
    setResult(null);
    setNotice("");
    setAnnouncement("Changes discarded.");
  }
  async function reload() {
    if (
      await confirm({
        title: "Reload homepage selections?",
        message: "Your unsaved changes will be lost.",
        confirmLabel: "Reload",
        cancelLabel: "Keep editing",
        danger: true,
      })
    )
      window.location.reload();
  }

  const full: Group[] = (["featured", "readThis"] as const).filter(
    (group) => choices[group].length >= ROW_LIMIT,
  );
  const saveMessage = pending
    ? "Saving selections…"
    : result?.ok && !dirty
      ? "Homepage selections saved."
      : "";
  const saveError = result && !result.ok ? messages[result.code] : "";
  return (
    <div className={styles.page}>
      <SlotBoard
        choices={choices}
        blocked={blocked}
        drag={drag}
        handlers={handlers}
        onShift={shift}
        onRemove={remove}
      />
      <StoryLibrary
        initial={library}
        blocked={blocked}
        selectedIds={selected.map((item) => item.id)}
        full={full}
        handlers={handlers}
        onAdd={add}
        onNotice={setNotice}
      />
      <p role="status" aria-live="polite" className={styles.srOnly}>
        {announcement}
      </p>
      <p aria-live="polite" className={styles.srOnly}>
        {saveMessage}
      </p>
      <p role="alert" className={styles.srOnly}>
        {[notice, saveError].filter(Boolean).join(" ")}
      </p>
      {(dirty || pending || result || notice) && (
        <div className={styles.saveBar} data-dirty={dirty || undefined}>
          <div className={styles.saveText}>
            {notice && <p aria-hidden="true">{notice}</p>}
            {saveMessage && <p aria-hidden="true">{saveMessage}</p>}
            {result && !result.ok && (
              <div>
                <p aria-hidden="true">{saveError}</p>
                {retry && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => void run(retry)}
                  >
                    Retry original request
                  </Button>
                )}
                {["conflict", "request_conflict", "invalid_input"].includes(
                  result.code,
                ) && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void reload()}
                  >
                    Reload selections
                  </Button>
                )}
              </div>
            )}
            {!notice && !pending && !result && dirty && <p>Unsaved changes</p>}
          </div>
          <div className={styles.saveActions}>
            <Button
              type="button"
              variant="secondary"
              disabled={blocked || !dirty}
              onClick={discard}
            >
              Discard
            </Button>
            <Button
              type="button"
              disabled={blocked || !dirty}
              onClick={save}
              aria-label="Save homepage selections"
            >
              Save
            </Button>
          </div>
        </div>
      )}
      {confirmDialog}
      <noscript>Enable JavaScript to manage homepage selections.</noscript>
    </div>
  );
}
