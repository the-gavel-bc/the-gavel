import Link from "next/link";
import type {
  MemberFilters,
  MemberPage,
  StaffSummary,
} from "@/backend/memberships/member-directory/member-directory";
import { MemberControls } from "./member-controls";
import { AddPeopleForm } from "./add-people-form";
import list from "@/frontend/components/dashboard/admin-list/admin-list.module.css";
import styles from "./admin-members.module.css";

const stateLabels = {
  active: "Active",
  inactive: "Inactive",
  invited: "Not signed in yet",
} as const;
const roleLabels = {
  author: "Author",
  administrator: "Administrator",
} as const;

function filterHref(filters: Partial<Record<"state" | "role" | "q", string>>) {
  const query = new URLSearchParams(filters);
  return `/dashboard/admin/members${query.size ? `?${query}` : ""}`;
}

export function AdminMemberList({
  page,
  summary,
  filters,
  currentUserId,
}: {
  page: MemberPage;
  summary: StaffSummary;
  filters: MemberFilters;
  currentUserId: string;
}) {
  const next = page.nextCursor
    ? new URLSearchParams({
        cursor: page.nextCursor,
        state: filters.state,
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.search ? { q: filters.search } : {}),
      })
    : null;
  const counts = [
    {
      label: "Administrators",
      value: summary.administrators,
      href: filterHref({ state: "active", role: "administrator" }),
    },
    {
      label: "Authors",
      value: summary.authors,
      href: filterHref({ state: "active", role: "author" }),
    },
    {
      label: "Not signed in yet",
      value: summary.invited,
      href: filterHref({ state: "invited" }),
    },
    {
      label: "Inactive",
      value: summary.inactive,
      href: filterHref({ state: "inactive" }),
    },
  ];
  return (
    <section aria-label="Member directory">
      <ul className={styles.counts} aria-label="Staff by role">
        {counts.map((count) => (
          <li key={count.label}>
            <Link href={count.href} prefetch={false}>
              <strong>{count.value}</strong> {count.label}
            </Link>
          </li>
        ))}
      </ul>
      <details className={styles.add}>
        <summary>Add people</summary>
        <AddPeopleForm />
      </details>
      <form
        action="/dashboard/admin/members"
        method="get"
        className={list.toolbar}
        role="search"
      >
        <label>
          Search
          <input
            type="search"
            name="q"
            defaultValue={filters.search}
            placeholder="Name or email"
            maxLength={100}
          />
        </label>
        <label>
          Role
          <select name="role" defaultValue={filters.role ?? ""}>
            <option value="">All roles</option>
            <option value="administrator">Administrators</option>
            <option value="author">Authors</option>
          </select>
        </label>
        <label>
          State
          <select name="state" defaultValue={filters.state}>
            <option value="all">All</option>
            {Object.entries(stateLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply filter</button>
      </form>
      {page.items.length === 0 ? (
        <p>No one matches this filter.</p>
      ) : (
        <ul className={styles.people}>
          {page.items.map((member) => (
            <li key={member.key} className={styles.person}>
              <div className={styles.identity}>
                <h2>{member.displayName ?? member.email}</h2>
                <p>
                  {member.displayName ? member.email : "Name set at sign-in"}
                </p>
              </div>
              <p className={styles.tags}>
                <span
                  className={list.badge}
                  data-state="neutral"
                  data-role={member.role}
                >
                  {roleLabels[member.role]}
                </span>
                <span
                  className={list.badge}
                  data-state={
                    member.state === "invited" ? "pending" : member.state
                  }
                >
                  {stateLabels[member.state]}
                </span>
              </p>
              {!member.eligible && (
                <p>Identity is not currently eligible for dashboard access.</p>
              )}
              <MemberControls
                key={`${member.key}:${member.state}:${member.version}:${member.role}`}
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
