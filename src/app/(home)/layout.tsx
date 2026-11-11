import type { ReactNode } from "react";
import { getPublicHomepageForRequest } from "@/backend/public-homepage/public-homepage";
import { PublicReaderShell } from "@/app/_components/public-reader-shell/public-reader-shell";

export const dynamic = "force-dynamic";
export default async function HomeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return PublicReaderShell({
    children,
    footer: getPublicHomepageForRequest(),
  });
}
