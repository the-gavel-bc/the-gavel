import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import {
  listAdminContributors,
  contributorStateSchema,
} from "@/backend/contributors/admin-contributors/admin-contributors";
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
      <ContributorControls />
      <form action="/dashboard/admin/contributors" method="get">
        <label htmlFor="contributor-state">State</label>
        <select id="contributor-state" name="state" defaultValue={selected}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button type="submit">Apply filter</button>
      </form>
      {page.items.length === 0 ? (
        <p>No contributors match this filter.</p>
      ) : (
        <ul>
          {page.items.map((person) => (
            <li key={person.id}>
              <h2>{person.displayName}</h2>
              <p>Author URL: /authors/{person.slug}</p>
              <p>
                {person.linkedAccount ? "Member profile" : "Guest contributor"}
              </p>
              {!person.active && <p>Inactive</p>}
              {person.slugFrozen && <p>Published slug fixed</p>}
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
