import type { ReactNode } from "react";
import { getPublicReadThis } from "@/backend/public-homepage/public-homepage";
import { PublicReaderShell } from "@/app/_components/public-reader-shell/public-reader-shell";

export const dynamic = "force-dynamic";
export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return PublicReaderShell({
    children,
    footer: getPublicReadThis(),
  });
}
