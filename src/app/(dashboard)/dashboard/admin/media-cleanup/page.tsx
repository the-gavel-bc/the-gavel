import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getMediaCleanupStatus } from "@/backend/media/retired-media-cleanup/cleanup-status";
import styles from "@/frontend/features/media/components/media-cleanup/media-cleanup.module.css";
import { MediaCleanupControl } from "@/frontend/features/media/components/media-cleanup/media-cleanup-control";
// The retry action runs the time-boxed sweep (about 40 s) in this function.
export const maxDuration = 60;
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});
export default async function MediaCleanupPage() {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Media cleanup</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  let status;
  try {
    status = await getMediaCleanupStatus();
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Media cleanup</h1>
        <p role="alert">Unable to load cleanup status.</p>
      </>
    );
  }
  const healthy = status.failedKeys === 0 && status.failedPrefixes === 0;
  const when = (value: string | null, none: string) =>
    value ? `${date.format(new Date(value))} ET` : none;
  const tiles = [
    ["Tracked image keys", String(status.keys)],
    ["Tracked article prefixes", String(status.prefixes)],
    ["Keys awaiting first check", String(status.unattempted)],
    ["Failed key checks", String(status.failedKeys)],
    ["Failed prefix scans", String(status.failedPrefixes)],
  ] as const;
  const times = [
    [
      "Oldest key check or creation",
      when(status.oldestKeyCheck, "No tracked keys"),
    ],
    [
      "Oldest prefix check or creation",
      when(status.oldestPrefixCheck, "No tracked prefixes"),
    ],
    [
      "Last healthy check",
      when(status.lastHealthyAt, "No successful check yet"),
    ],
  ] as const;
  return (
    <>
      <h1>Media cleanup</h1>
      <p className={styles.lede}>
        <span className={styles.chip} data-ok={healthy || undefined}>
          {healthy ? "Healthy" : "Needs attention"}
        </span>
        Deleted article images stay under repeated monitoring for late uploads.
        A successful check does not end monitoring.
      </p>
      <dl className={styles.tiles}>
        {tiles.map(([label, value]) => (
          <div key={label} className={styles.tile}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <dl className={styles.times}>
        {times.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <MediaCleanupControl />
    </>
  );
}
