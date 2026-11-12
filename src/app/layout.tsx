import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Playfair_Display, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Self-hosted at build time: the browser loads these from this origin only,
// so the CSP's font-src 'self' holds. Reader styles opt in via the variables.
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-display",
});
const body = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-body",
});

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
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
