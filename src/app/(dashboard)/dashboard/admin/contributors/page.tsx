import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import {
  listAdminContributors,
  contributorStateSchema,
} from "@/backend/contributors/admin-contributors/admin-contributors";
import list from "@/frontend/components/dashboard/admin-list/admin-list.module.css";
import { ContributorControls } from "@/frontend/features/contributors/components/admin-contributors/contributor-controls";

export default async function AdminContributorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Contributors</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  const input = await searchParams;
  let page;
  try {
    page = await listAdminContributors(input);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Contributors</h1>
        <p role="alert">Unable to load contributors.</p>
        <Link href="/dashboard/admin/contributors" prefetch={false}>
          Reset filter
        </Link>
      </>
    );
  }
  const state = contributorStateSchema.safeParse(input.state);
  const selected = state.success ? state.data : "all";
  const next = page.nextCursor
    ? new URLSearchParams({ state: selected, cursor: page.nextCursor })
    : null;
  return (
    <>
      <h1>Contributors</h1>
      <p>
        Public names create author-page slugs automatically. Slugs stay fixed
        after publication.
      </p>
      <p>
        <Link href="/dashboard/admin/articles">Article management</Link>
      </p>
      <section className={list.card} aria-labelledby="new-contributor">
        <h2 id="new-contributor">New guest contributor</h2>
        <ContributorControls />
      </section>
      <form
        action="/dashboard/admin/contributors"
        method="get"
        className={list.toolbar}
      >
        <label htmlFor="contributor-state">
          State
          <select id="contributor-state" name="state" defaultValue={selected}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <button type="submit">Apply filter</button>
      </form>
      {page.items.length === 0 ? (
        <p>No contributors match this filter.</p>
      ) : (
        <ul className={list.rows}>
          {page.items.map((person) => (
            <li key={person.id} className={list.row}>
              <h2>{person.displayName}</h2>
              <p className={list.meta}>
                <span
                  className={list.badge}
                  data-state={person.active ? "active" : "inactive"}
                >
                  {person.active ? "Active" : "Inactive"}
                </span>
                <span className={list.badge} data-state="neutral">
                  {person.linkedAccount
                    ? "Member profile"
                    : "Guest contributor"}
                </span>
                {person.slugFrozen && <span>Published slug fixed</span>}
              </p>
              <p>Author URL: /authors/{person.slug}</p>
              <ContributorControls
                key={`${person.id}:${person.version}:${person.active}`}
                contributor={person}
              />
            </li>
          ))}
        </ul>
      )}
      {next && (
        <nav aria-label="Contributor pages">
          <Link href={`/dashboard/admin/contributors?${next}`} prefetch={false}>
            Next page
          </Link>
        </nav>
      )}
    </>
  );
}
