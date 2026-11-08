import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { listMemberAudit } from "@/backend/memberships/member-audit/member-audit";

const labels = {
  "membership.approved": "Approved membership",
  "membership.role_changed": "Changed membership role",
  "membership.deactivated": "Deactivated membership",
} as const;
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function MemberAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Membership activity</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  let page;
  try {
    page = await listMemberAudit(await searchParams);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Membership activity</h1>
        <p role="alert">Unable to load membership activity.</p>
        <Link href="/dashboard/admin/members/audit" prefetch={false}>
          Reset page
        </Link>
      </>
    );
  }
  return (
    <>
      <h1>Membership activity</h1>
      <p>
        <Link href="/dashboard/admin/members">Memberships</Link>
      </p>
      {page.items.length === 0 ? (
        <p>No membership activity yet.</p>
      ) : (
        <ol>
          {page.items.map((event) => (
            <li key={event.id}>
              <strong>{labels[event.action]}</strong> for{" "}
              {event.targetEmail || "Former member"} by {event.actorLabel} on{" "}
              <time dateTime={event.createdAt}>
                {date.format(new Date(event.createdAt))} UTC
              </time>
            </li>
          ))}
        </ol>
      )}
      {page.nextCursor && (
        <nav aria-label="Membership activity pages">
          <Link
            href={`/dashboard/admin/members/audit?${new URLSearchParams({ cursor: page.nextCursor })}`}
            prefetch={false}
          >
            Next page
          </Link>
        </nav>
      )}
    </>
  );
}
