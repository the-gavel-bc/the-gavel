import Link from "next/link";
import type {
  MemberPage,
  MemberState,
} from "@/lib/memberships/member-directory/member-directory";
import { MemberControls } from "./member-controls";
import styles from "./admin-members.module.css";

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
        className={styles.filter}
      >
        <label htmlFor="member-state">State</label>
        <select id="member-state" name="state" defaultValue={state}>
          <option value="all">All</option>
          {Object.entries(states).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit">Apply filter</button>
      </form>
      {page.items.length === 0 ? (
        <p>No memberships match this filter.</p>
      ) : (
        <ul className={styles.members}>
          {page.items.map((member) => (
            <li key={member.userId} className={styles.member}>
              <h2>{member.email || "Email unavailable"}</h2>
              <p>{states[member.state]}</p>
              {member.displayName && <p>Public name: {member.displayName}</p>}
              {member.role && <p>Role: {member.role}</p>}
              {!member.eligible && (
                <p>Identity is not currently eligible for dashboard access.</p>
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
