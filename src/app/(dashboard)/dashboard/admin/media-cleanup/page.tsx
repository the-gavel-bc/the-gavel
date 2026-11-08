import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getMediaCleanupStatus } from "@/backend/media/retired-media-cleanup/cleanup-status";
import { MediaCleanupControl } from "@/components/dashboard/media-cleanup/media-cleanup-control";
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
  return (
    <>
      <h1>Media cleanup</h1>
      <p>
        Deleted article image locations remain under repeated monitoring for
        late uploads. A successful check does not end monitoring.
      </p>
      <dl>
        <dt>Tracked image keys</dt>
        <dd>{status.keys}</dd>
        <dt>Tracked article prefixes</dt>
        <dd>{status.prefixes}</dd>
        <dt>Keys awaiting first check</dt>
        <dd>{status.unattempted}</dd>
        <dt>Failed key checks</dt>
        <dd>{status.failedKeys}</dd>
        <dt>Failed prefix scans</dt>
        <dd>{status.failedPrefixes}</dd>
        <dt>Oldest key check or creation</dt>
        <dd>{status.oldestKeyCheck ?? "No tracked keys"}</dd>
        <dt>Oldest prefix check or creation</dt>
        <dd>{status.oldestPrefixCheck ?? "No tracked prefixes"}</dd>
        <dt>Last healthy check</dt>
        <dd>{status.lastHealthyAt ?? "No successful check yet"}</dd>
      </dl>
      <MediaCleanupControl />
      <p>
        <Link href="/dashboard/admin/articles">Article management</Link>
      </p>
    </>
  );
}
