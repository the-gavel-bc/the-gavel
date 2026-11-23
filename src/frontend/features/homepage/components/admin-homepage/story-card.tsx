"use client";
import { Button } from "@/frontend/components/ui/button/button";
import { useState } from "react";
import type { DragEvent } from "react";
import {
  groupLabel,
  type Group,
  type Place,
  type Story,
} from "./homepage-arrangement";
import styles from "./homepage-editor.module.css";

export type DragState = { story: Story; from: Place | null } | null;
export type DragHandlers = {
  start: (story: Story, from: Place | null) => void;
  end: () => void;
  drop: (to: Place) => void;
};

export function StoryImage({ story }: { story: Story }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.media}>
      {story.imageUrl && !failed && (
        // Same-origin cached image route; next/image is not used under the CSP.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={story.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function dragProps(
  story: Story,
  from: Place | null,
  handlers: DragHandlers,
  enabled: boolean,
) {
  return {
    draggable: enabled,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = "move";
      // Firefox only starts a drag when some data is set.
      event.dataTransfer.setData("text/plain", story.id);
      handlers.start(story, from);
    },
    onDragEnd: () => handlers.end(),
  };
}

export function SlotCard({
  story,
  group,
  index,
  count,
  blocked,
  dragging,
  handlers,
  onShift,
  onRemove,
}: {
  story: Story;
  group: Group;
  index: number;
  count: number;
  blocked: boolean;
  dragging: boolean;
  handlers: DragHandlers;
  onShift: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  const label = groupLabel[group];
  const [over, setOver] = useState(false);
  return (
    <li
      className={styles.card}
      data-dragging={dragging || undefined}
      data-over={over || undefined}
      data-lead={group === "lead" || undefined}
      {...dragProps(story, { group, index }, handlers, !blocked)}
      onFocus={(event) =>
        event.currentTarget.scrollIntoView?.({
          block: "nearest",
          inline: "nearest",
        })
      }
      onDragOver={(event) => {
        if (blocked) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        handlers.drop({ group, index });
      }}
    >
      <StoryImage story={story} />
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>{story.title}</p>
        {(story.status !== "published" || story.eligible === false) && (
          <strong className={styles.warn}>
            (
            {story.status === "published"
              ? "Unavailable to readers"
              : story.status}
            . Remove before saving.)
          </strong>
        )}
      </div>
      <div className={styles.cardActions}>
        {group !== "lead" && (
          <>
            <Button
              variant="secondary"
              type="button"
              disabled={blocked || index === 0}
              onClick={() => onShift(-1)}
              aria-label={`Move ${story.title} left in ${label}`}
            >
              <span aria-hidden="true">←</span>
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={blocked || index === count - 1}
              onClick={() => onShift(1)}
              aria-label={`Move ${story.title} right in ${label}`}
            >
              <span aria-hidden="true">→</span>
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="danger"
          disabled={blocked}
          onClick={onRemove}
          aria-label={
            group === "lead"
              ? "Remove lead"
              : `Remove ${story.title} from ${label}`
          }
        >
          <span aria-hidden="true">×</span>
        </Button>
      </div>
    </li>
  );
}

export function EmptyTile({
  group,
  index,
  blocked,
  handlers,
}: {
  group: Group;
  index: number;
  blocked: boolean;
  handlers: DragHandlers;
}) {
  const [over, setOver] = useState(false);
  return (
    <li
      className={styles.empty}
      data-over={over || undefined}
      data-lead={group === "lead" || undefined}
      onDragOver={(event) => {
        if (blocked) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        handlers.drop({ group, index });
      }}
    >
      <span>{group === "lead" ? "Add a lead story" : "Add a story"}</span>
    </li>
  );
}
