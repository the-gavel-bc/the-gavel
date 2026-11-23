import { Button } from "@/frontend/components/ui/button/button";
import Link from "next/link";
import type {
  MemberFilters,
  MemberPage,
  MemberSummary,
  StaffSummary,
} from "@/backend/memberships/member-directory/member-directory";
import { staffRoleLabels } from "@/shared/memberships/staff-roles/staff-roles";
import { MemberControls } from "./member-controls";
import { ProfileModeration } from "./profile-moderation";
import { AddPeopleForm } from "./add-people-form";
import styles from "./admin-members.module.css";

const stateLabels = {
  active: "Active",
  inactive: "Inactive",
  invited: "Not signed in yet",
} as const;

function initials(person: MemberSummary) {
  const source = person.displayName ?? person.email.split("@")[0];
  const words = source.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (
    (words[0]?.[0] ?? "?") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
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
  // Every pill keeps the current search, so searching inside a group works.
  const href = (
    state: string,
    role?: string,
    extra?: Record<string, string>,
  ) => {
    const query = new URLSearchParams({
      ...(state === "all" ? {} : { state }),
      ...(role ? { role } : {}),
      ...(filters.search ? { q: filters.search } : {}),
      ...extra,
    });
    return `/dashboard/admin/members${query.size ? `?${query}` : ""}`;
  };
  const pills = [
    {
      label: "All",
      count:
        summary.administrators +
        summary.editors +
        summary.authors +
        summary.invited +
        summary.inactive,
      href: href("all"),
      active: filters.state === "all" && !filters.role,
    },
    {
      label: "Administrators",
      count: summary.administrators,
      href: href("active", "administrator"),
      active: filters.state === "active" && filters.role === "administrator",
    },
    {
      label: "Editors",
      count: summary.editors,
      href: href("active", "editor"),
      active: filters.state === "active" && filters.role === "editor",
    },
    {
      label: "Authors",
      count: summary.authors,
      href: href("active", "author"),
      active: filters.state === "active" && filters.role === "author",
    },
    {
      label: "Not signed in yet",
      count: summary.invited,
      href: href("invited"),
      active: filters.state === "invited" && !filters.role,
    },
    {
      label: "Inactive",
      count: summary.inactive,
      href: href("inactive"),
      active: filters.state === "inactive" && !filters.role,
    },
  ];
  return (
    <section aria-label="Member directory" className={styles.directory}>
      <div className={styles.top}>
        <form
          action="/dashboard/admin/members"
          method="get"
          role="search"
          className={styles.search}
        >
          {filters.state !== "all" && (
            <input type="hidden" name="state" value={filters.state} />
          )}
          {filters.role && (
            <input type="hidden" name="role" value={filters.role} />
          )}
          <label>
            <span className={styles.visuallyHidden}>Search people</span>
            <input
              type="search"
              name="q"
              defaultValue={filters.search}
              placeholder="Search by name or email"
              maxLength={100}
            />
          </label>
          <Button type="submit">Search</Button>
        </form>
        <details className={styles.add}>
          <summary>Add people</summary>
          <div className={styles.addPanel}>
            <AddPeopleForm />
          </div>
        </details>
      </div>
      <nav aria-label="Filter people" className={styles.pills}>
        {pills.map((pill) => (
          <Link
            key={pill.label}
            href={pill.href}
            prefetch={false}
            aria-current={pill.active ? "page" : undefined}
          >
            {pill.label} <span>{pill.count}</span>
          </Link>
        ))}
      </nav>
      {page.items.length === 0 ? (
        <p className={styles.empty}>No one matches this filter.</p>
      ) : (
        <ul className={styles.people}>
          {page.items.map((member) => (
            <li key={member.key} className={styles.person}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(member)}
              </span>
              <div className={styles.identity}>
                <h2>
                  <Link
                    href={`/dashboard/admin/members/audit?user=${member.key}`}
                    prefetch={false}
                  >
                    {member.displayName ?? member.email}
                  </Link>
                </h2>
                <p>
                  {member.displayName ? member.email : "Name set at sign-in"}
                </p>
                {!member.eligible && (
                  <p className={styles.warning}>
                    Identity is not currently eligible for dashboard access.
                  </p>
                )}
              </div>
              <p className={styles.tags}>
                <span data-role={member.role}>
                  {staffRoleLabels[member.role]}
                </span>
                <span data-state={member.state}>
                  {stateLabels[member.state]}
                </span>
              </p>
              <MemberControls
                key={`${member.key}:${member.state}:${member.version}:${member.role}`}
                member={member}
                isSelf={member.userId === currentUserId}
              />
              {member.userId && <ProfileModeration userId={member.userId} />}
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor && (
        <nav aria-label="Membership pages" className={styles.more}>
          <Link
            href={href(filters.state, filters.role ?? undefined, {
              cursor: page.nextCursor,
            })}
            prefetch={false}
          >
            Next page
          </Link>
        </nav>
      )}
    </section>
  );
}
