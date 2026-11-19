"use client";
import {
  groupLabel,
  ROW_LIMIT,
  type Choices,
  type RowGroup,
} from "./homepage-arrangement";
import {
  EmptyTile,
  SlotCard,
  type DragHandlers,
  type DragState,
} from "./story-card";
import styles from "./homepage-editor.module.css";

export function SlotBoard({
  choices,
  blocked,
  drag,
  handlers,
  onShift,
  onRemove,
}: {
  choices: Choices;
  blocked: boolean;
  drag: DragState;
  handlers: DragHandlers;
  onShift: (group: RowGroup, index: number, offset: -1 | 1) => void;
  onRemove: (group: "lead" | RowGroup, index: number) => void;
}) {
  const rows: RowGroup[] = ["featured", "readThis"];
  return (
    <div className={styles.board}>
      <section aria-label={groupLabel.lead} className={styles.leadSection}>
        <h2>{groupLabel.lead}</h2>
        <ol className={styles.leadSlot}>
          {choices.lead ? (
            <SlotCard
              story={choices.lead}
              group="lead"
              index={0}
              count={1}
              blocked={blocked}
              dragging={drag?.story.id === choices.lead.id}
              handlers={handlers}
              onShift={() => undefined}
              onRemove={() => onRemove("lead", 0)}
            />
          ) : (
            <EmptyTile
              group="lead"
              index={0}
              blocked={blocked}
              handlers={handlers}
            />
          )}
        </ol>
      </section>
      {rows.map((group) => {
        const stories = choices[group];
        return (
          <section
            key={group}
            aria-label={groupLabel[group]}
            className={styles.rowSection}
          >
            <h2>
              {groupLabel[group]}{" "}
              <span className={styles.count}>
                {stories.length}/{ROW_LIMIT}
              </span>
            </h2>
            <ol className={styles.strip}>
              {stories.map((story, index) => (
                <SlotCard
                  key={story.id}
                  story={story}
                  group={group}
                  index={index}
                  count={stories.length}
                  blocked={blocked}
                  dragging={drag?.story.id === story.id}
                  handlers={handlers}
                  onShift={(offset) => onShift(group, index, offset)}
                  onRemove={() => onRemove(group, index)}
                />
              ))}
              {Array.from({ length: ROW_LIMIT - stories.length }, (_, n) => (
                <EmptyTile
                  key={`empty-${n}`}
                  group={group}
                  index={stories.length}
                  blocked={blocked}
                  handlers={handlers}
                />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
