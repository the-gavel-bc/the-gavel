"use client";
import { useRef, useState } from "react";
import {
  listHomepageStoriesAction,
  type LibraryPage,
} from "@/backend/homepage/homepage-curation/homepage-stories-action";
import { dragProps, StoryImage, type DragHandlers } from "./story-card";
import type { Group, Story } from "./homepage-arrangement";
import styles from "./homepage-editor.module.css";

const searchPattern = /^[\p{L}\p{N} '\-]+$/u;

export function StoryLibrary({
  initial,
  blocked,
  selectedIds,
  full,
  handlers,
  onAdd,
  onNotice,
}: {
  initial: LibraryPage;
  blocked: boolean;
  selectedIds: string[];
  /** Groups whose rows are full, so their buttons are disabled. */
  full: Group[];
  handlers: DragHandlers;
  onAdd: (story: Story, group: Group) => void;
  onNotice: (message: string) => void;
}) {
  // Pages already loaded for the current search; arrows move between them.
  const [pages, setPages] = useState<LibraryPage[]>([initial]);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const active = useRef("");
  const page = pages[index];

  async function load(search: string, cursor?: string) {
    setLoading(true);
    setError("");
    try {
      const result = await listHomepageStoriesAction({
        ...(search ? { search } : {}),
        ...(cursor ? { cursor } : {}),
      });
      if (!result.ok) {
        setError("Could not load stories. Try again.");
        return null;
      }
      return {
        items: result.items,
        nextCursor: result.nextCursor,
      } satisfies LibraryPage;
    } catch {
      setError("Could not load stories. Try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (value.length > 80 || (value && !searchPattern.test(value))) {
      onNotice(
        "Search accepts letters, numbers, spaces, apostrophes and hyphens.",
      );
      return;
    }
    onNotice("");
    const first = await load(value);
    if (!first) return;
    active.current = value;
    setPages([first]);
    setIndex(0);
  }

  async function forward() {
    if (index + 1 < pages.length) return setIndex(index + 1);
    if (!page.nextCursor) return;
    const next = await load(active.current, page.nextCursor);
    if (!next) return;
    setPages((current) => [...current, next]);
    setIndex(index + 1);
  }

  return (
    <section aria-label="Published stories" className={styles.library}>
      <div className={styles.libraryHead}>
        <h2>Stories</h2>
        <form
          onSubmit={(event) => void search(event)}
          className={styles.search}
          role="search"
        >
          <label>
            <span className={styles.srOnly}>Search titles</span>
            <input
              type="search"
              value={text}
              maxLength={80}
              placeholder="Search titles"
              disabled={blocked}
              onChange={(event) => setText(event.target.value)}
              aria-label="Search titles"
            />
          </label>
          <button type="submit" disabled={blocked || loading}>
            Search
          </button>
        </form>
        <div className={styles.pager}>
          <button
            type="button"
            aria-label="Previous stories"
            disabled={blocked || loading || index === 0}
            onClick={() => setIndex(index - 1)}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            aria-label="More stories"
            disabled={
              blocked ||
              loading ||
              (index + 1 >= pages.length && !page.nextCursor)
            }
            onClick={() => void forward()}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {page.items.length === 0 ? (
        <p className={styles.none}>No published stories match.</p>
      ) : (
        <ul className={styles.libraryStrip} aria-busy={loading}>
          {page.items.map((story) => {
            const taken = selectedIds.includes(story.id);
            return (
              <li
                key={story.id}
                className={styles.libraryCard}
                data-taken={taken || undefined}
                {...dragProps(story, null, handlers, !blocked && !taken)}
              >
                <StoryImage story={story} />
                <p className={styles.cardTitle}>{story.title}</p>
                <div className={styles.addRow}>
                  <button
                    type="button"
                    aria-label={`Set ${story.title} as lead`}
                    disabled={blocked || taken}
                    onClick={() => onAdd(story, "lead")}
                  >
                    Lead
                  </button>
                  <button
                    type="button"
                    aria-label={`Add ${story.title} to Featured News`}
                    disabled={blocked || taken || full.includes("featured")}
                    onClick={() => onAdd(story, "featured")}
                  >
                    Featured
                  </button>
                  <button
                    type="button"
                    aria-label={`Add ${story.title} to Read This`}
                    disabled={blocked || taken || full.includes("readThis")}
                    onClick={() => onAdd(story, "readThis")}
                  >
                    Read
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
