import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import {
  listAdminTaxonomy,
  taxonomyKindSchema,
} from "@/backend/taxonomy/admin-taxonomy/admin-taxonomy";
import list from "@/frontend/components/dashboard/admin-list/admin-list.module.css";
import { TaxonomyControls } from "@/frontend/features/taxonomy/components/admin-taxonomy/taxonomy-controls";
import { TagControls } from "@/frontend/features/taxonomy/components/admin-taxonomy/tag-controls";
import { CreateTaxonomyForm } from "@/frontend/features/taxonomy/components/admin-taxonomy/create-taxonomy-form";

export default async function AdminTaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Taxonomy</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  const input = await searchParams;
  let page;
  let sections: { id: string; name: string }[] = [];
  try {
    // Tags are one flat list; show a larger page so merging has targets.
    page = await listAdminTaxonomy(
      input.kind === "tag" ? { ...input, pageSize: 50 } : input,
    );
    if (input.kind === "category")
      sections = (
        await listAdminTaxonomy({ kind: "section", pageSize: 50 })
      ).items
        .filter((section) => section.active)
        .map((section) => ({ id: section.id, name: section.name }));
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Taxonomy</h1>
        <p role="alert">Unable to load taxonomy.</p>
        <Link href="/dashboard/admin/taxonomy" prefetch={false}>
          Reset filter
        </Link>
      </>
    );
  }
  const selected = taxonomyKindSchema.safeParse(input.kind);
  const kind = selected.success ? selected.data : "section";
  const next = page.nextCursor
    ? new URLSearchParams({ kind, cursor: page.nextCursor })
    : null;
  // Sections that fit on one page are listed in menu order, as readers see
  // them. Paged catalogs keep the server's order so pages stay consistent.
  const onePage = !page.nextCursor && input.cursor === undefined;
  const items =
    kind === "section" && onePage
      ? [...page.items].sort(
          (a, b) =>
            (a.navigationOrder ?? Infinity) - (b.navigationOrder ?? Infinity),
        )
      : page.items;
  return (
    <>
      <h1>Taxonomy</h1>
      <p>
        <Link href="/dashboard/admin/articles">Article management</Link>
      </p>
      <form
        action="/dashboard/admin/taxonomy"
        method="get"
        className={list.toolbar}
      >
        <label htmlFor="taxonomy-kind">
          Catalog
          <select id="taxonomy-kind" name="kind" defaultValue={kind}>
            <option value="section">Sections</option>
            <option value="category">Categories</option>
            <option value="tag">Tags</option>
          </select>
        </label>
        <button type="submit">Show catalog</button>
      </form>
      {kind === "tag" ? (
        <p>
          Members create tags in the article editor. Rename a tag, merge
          duplicates, or delete a tag no story uses.
        </p>
      ) : (
        <CreateTaxonomyForm
          kind={kind}
          sections={sections}
          nextOrder={
            Math.max(-1, ...page.items.map((i) => i.navigationOrder ?? -1)) + 1
          }
        />
      )}
      {page.items.length === 0 ? (
        <p>No items in this catalog.</p>
      ) : (
        <ul className={list.rows}>
          {items.map((item) => (
            <li key={item.id} className={list.row}>
              <h2>{item.name}</h2>
              <p className={list.meta}>
                {item.active !== null && (
                  <span
                    className={list.badge}
                    data-state={item.active ? "active" : "inactive"}
                  >
                    {item.active ? "Active" : "Inactive"}
                  </span>
                )}
                <span>Slug: {item.slug}</span>
                {item.parentName && <span>Section: {item.parentName}</span>}
                {kind === "tag" && (
                  <span>{item.referencedLive ? "In use" : "Unused"}</span>
                )}
              </p>
              {kind === "tag" ? (
                <TagControls
                  key={`${item.id}:${item.name}:${item.referencedLive}`}
                  item={item}
                  others={page.items
                    .filter((tag) => tag.id !== item.id)
                    .map((tag) => ({ id: tag.id, name: tag.name }))}
                />
              ) : (
                <TaxonomyControls
                  key={`${item.id}:${item.version}`}
                  item={item}
                  kind={kind}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {next && (
        <nav aria-label="Taxonomy pages">
          <Link href={`/dashboard/admin/taxonomy?${next}`} prefetch={false}>
            Next page
          </Link>
        </nav>
      )}
    </>
  );
}
