import Link from "next/link";
import type {
  MemberPage,
  MemberState,
} from "@/backend/memberships/member-directory/member-directory";
import { MemberControls } from "./member-controls";
import list from "@/frontend/components/dashboard/admin-list/admin-list.module.css";

const states: Record<Exclude<MemberState, "all">, string> = {
  pending: "Pending approval",
  active: "Active",
  inactive: "Inactive",
};

export function AdminMemberList({
  page,
  state,
  currentUserId,
}: {
  page: MemberPage;
  state: MemberState;
  currentUserId: string;
}) {
  const next = page.nextCursor
    ? new URLSearchParams({ cursor: page.nextCursor, state })
    : null;
  return (
    <section aria-label="Member directory">
      <form
        action="/dashboard/admin/members"
        method="get"
        className={list.toolbar}
      >
        <label htmlFor="member-state">
          State
          <select id="member-state" name="state" defaultValue={state}>
            <option value="all">All</option>
            {Object.entries(states).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply filter</button>
      </form>
      {page.items.length === 0 ? (
        <p>No memberships match this filter.</p>
      ) : (
        <ul className={list.rows}>
          {/* Requests waiting for approval come first on each page. */}
          {[...page.items]
            .sort(
              (a, b) =>
                Number(b.state === "pending") - Number(a.state === "pending"),
            )
            .map((member) => (
              <li key={member.userId} className={list.row}>
                <h2>{member.email || "Email unavailable"}</h2>
                <p className={list.meta}>
                  <span className={list.badge} data-state={member.state}>
                    {states[member.state]}
                  </span>
                  {member.displayName && (
                    <span>Public name: {member.displayName}</span>
                  )}
                  {member.role && <span>Role: {member.role}</span>}
                </p>
                {!member.eligible && (
                  <p>
                    Identity is not currently eligible for dashboard access.
                  </p>
                )}
                <MemberControls
                  key={`${member.userId}:${member.state}:${member.version ?? "pending"}`}
                  member={member}
                  isSelf={member.userId === currentUserId}
                />
              </li>
            ))}
        </ul>
      )}
      {next && (
        <nav aria-label="Membership pages">
          <Link href={`/dashboard/admin/members?${next}`} prefetch={false}>
            Next page
          </Link>
        </nav>
      )}
    </section>
  );
}
