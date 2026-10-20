import type { PropsWithChildren } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SkipLink } from "./skip-link";

export function PublicShell({ children }: PropsWithChildren) {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main className="public-main" id="main-content">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
