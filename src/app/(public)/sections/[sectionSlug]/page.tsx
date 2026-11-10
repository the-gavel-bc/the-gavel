import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicArchiveForRequest } from "@/backend/public-articles/public-archive/public-archive";
import { ArchiveGrid } from "@/frontend/features/reader/components/archive-grid/archive-grid";
type Props = {
  params: Promise<{ sectionSlug: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
};
async function read({ params, searchParams }: Props) {
  const [route, query] = await Promise.all([params, searchParams]);
  return getPublicArchiveForRequest(
    "section",
    route.sectionSlug,
    "",
    query.cursor,
  );
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const result = await read(props);
  if (result.kind === "notFound") notFound();
  if (result.kind === "unavailable")
    return {
      title: "Archive temporarily unavailable",
      robots: { index: false, follow: false },
    };
  return {
    title: result.archive.title,
    ...(result.kind === "invalid"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
export default async function ArchivePage(props: Props) {
  // Resolve active scope before streaming; missing taxonomy must remain HTTP 404.
  const result = await read(props);
  if (result.kind === "notFound") notFound();
  return <ArchiveGrid result={result} />;
}
