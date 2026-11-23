import { resolveTaxonomyRedirect } from "@/backend/taxonomy/taxonomy-redirect/taxonomy-redirect";
import { publicArchiveMetadata } from "@/backend/reader/public-metadata/public-metadata";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPublicTagArchiveForRequest } from "@/backend/public-articles/public-tag-archive/public-tag-archive";
import { ArchiveGrid } from "@/frontend/features/reader/components/archive-grid/archive-grid";
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
};
async function read({ params, searchParams }: Props) {
  const [route, query] = await Promise.all([params, searchParams]);
  const result = await getPublicTagArchiveForRequest(route.slug, query.cursor);
  if (result.kind === "notFound") {
    const destination = await resolveTaxonomyRedirect(`/tags/${route.slug}`);
    if (destination) redirect(destination);
    notFound();
  }
  return result;
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const result = await read(props);
  return publicArchiveMetadata(result);
}
export default async function ArchivePage(props: Props) {
  // Resolve active scope before streaming; missing taxonomy must remain HTTP 404.
  const result = await read(props);
  return <ArchiveGrid result={result} />;
}
