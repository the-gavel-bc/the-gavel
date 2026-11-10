import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(getServerEnv().SITE_URL),
    title: {
      default: "The Gavel",
      template: "%s | The Gavel",
    },
    description: "Independent student journalism at Boston College.",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
