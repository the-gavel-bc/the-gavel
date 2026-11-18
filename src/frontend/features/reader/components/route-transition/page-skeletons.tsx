import styles from "./page-skeletons.module.css";

export type SkeletonKind =
  "home" | "article" | "archive" | "author" | "search" | "page";

const Bone = ({ className = "" }: { className?: string }) => (
  <span className={`${styles.bone} ${className}`} />
);
const Lines = ({
  count,
  last = styles.short,
}: {
  count: number;
  last?: string;
}) =>
  Array.from({ length: count }, (_, index) => (
    <Bone
      key={index}
      className={`${styles.line} ${index === count - 1 ? last : ""}`}
    />
  ));

// Mirrors ArticleCard: image, byline and date, title, summary.
const Card = () => (
  <div className={styles.card}>
    <Bone className={styles.media} />
    <Bone className={`${styles.line} ${styles.meta}`} />
    <Bone className={styles.title} />
    <Lines count={2} />
  </div>
);
const Grid = ({ count, columns = "" }: { count: number; columns?: string }) => (
  <div className={`${styles.grid} ${columns}`}>
    {Array.from({ length: count }, (_, index) => (
      <Card key={index} />
    ))}
  </div>
);
// Mirrors ArchiveHeader: crumbs, large title, chips, rule.
const ArchiveHead = ({ chips = true }: { chips?: boolean }) => (
  <div className={styles.archiveHead}>
    <Bone className={`${styles.line} ${styles.crumbs}`} />
    <Bone className={styles.heading} />
    {chips && (
      <div className={styles.chips}>
        {Array.from({ length: 4 }, (_, index) => (
          <Bone key={index} className={styles.chip} />
        ))}
      </div>
    )}
  </div>
);

const layouts: Record<SkeletonKind, () => React.JSX.Element> = {
  // Hero with Latest beside it, the Featured band, then a section row.
  home: () => (
    <>
      <div className={styles.heroGrid}>
        <Bone className={styles.hero} />
        <div className={styles.latest}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className={styles.latestRow}>
              <Bone className={styles.media} />
              <div className={styles.stack}>
                <Bone className={`${styles.line} ${styles.meta}`} />
                <Bone className={styles.title} />
                <Lines count={2} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.band}>
        <Bone className={`${styles.heading} ${styles.onBand}`} />
        <Grid count={4} />
      </div>
      <Bone className={styles.heading} />
      <Grid count={4} />
    </>
  ),
  // Centred reading column: kicker, headline, dek, date, photo, body.
  article: () => (
    <div className={styles.article}>
      <Bone className={styles.pill} />
      <Bone className={styles.headline} />
      <Bone className={`${styles.headline} ${styles.short}`} />
      <Lines count={2} />
      <Bone className={`${styles.line} ${styles.meta}`} />
      <Bone className={styles.media} />
      <Lines count={7} />
    </div>
  ),
  archive: () => (
    <>
      <ArchiveHead />
      <Bone className={`${styles.media} ${styles.lead}`} />
      <Grid count={8} />
    </>
  ),
  author: () => (
    <>
      <ArchiveHead chips={false} />
      <div className={styles.bio}>
        <Bone className={styles.title} />
        <Lines count={3} />
      </div>
      <Grid count={8} />
    </>
  ),
  search: () => (
    <>
      <Bone className={styles.heading} />
      <div className={styles.searchRow}>
        <Bone className={styles.field} />
        <Bone className={styles.button} />
      </div>
      <Bone className={`${styles.line} ${styles.meta}`} />
      <Grid count={8} />
    </>
  ),
  page: () => (
    <div className={styles.article}>
      <Bone className={styles.heading} />
      <Lines count={5} />
      <Bone className={`${styles.title} ${styles.subhead}`} />
      <Lines count={4} />
    </div>
  ),
};

// A placeholder shaped like the destination page, so content swaps in without
// the layout jumping.
export function PageSkeleton({ kind }: { kind: SkeletonKind }) {
  const Layout = layouts[kind];
  return (
    <div className={styles.skeleton} aria-busy="true" data-skeleton={kind}>
      <p role="status" className={styles.srOnly}>
        Loading
      </p>
      <div aria-hidden="true">
        <Layout />
      </div>
    </div>
  );
}
