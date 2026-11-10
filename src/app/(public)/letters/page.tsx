import { publicArchiveMetadata } from "@/backend/reader/public-metadata/public-metadata";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicArchiveForRequest } from "@/backend/public-articles/public-archive/public-archive";
import { ArchiveGrid } from "@/frontend/features/reader/components/archive-grid/archive-grid";
type Props = {
  params: Promise<Record<string, never>>;
  searchParams: Promise<{ cursor?: string | string[] }>;
};
async function read({ searchParams }: Props) {
  const query = await searchParams;
  return getPublicArchiveForRequest("letters", "", "", query.cursor);
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const result = await read(props);
  if (result.kind === "notFound") notFound();
  return publicArchiveMetadata(result);
}
export default async function ArchivePage(props: Props) {
  // Resolve active scope before streaming; missing taxonomy must remain HTTP 404.
  const result = await read(props);
  if (result.kind === "notFound") notFound();
  return <ArchiveGrid result={result} />;
}
