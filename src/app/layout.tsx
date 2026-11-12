import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted, committed variable fonts (latin subset, SIL OFL 1.1; licenses
// beside the files). Builds never fetch fonts, and the CSP's font-src 'self'
// holds. Reader styles opt in via the CSS variables.
const display = localFont({
  src: "../frontend/assets/fonts/playfair-display-latin.woff2",
  weight: "400 900",
  display: "swap",
  variable: "--font-display",
});
const body = localFont({
  src: "../frontend/assets/fonts/source-serif-4-latin.woff2",
  weight: "200 900",
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
