import Link from "next/link";
import type { ReactNode } from "react";
export function ArticleListError({
  children,
  newestHref = "/dashboard",
}: {
  children: ReactNode;
  newestHref?: string;
}) {
  return (
    <section aria-label="Article loading error">
      <p role="alert">
        Unable to load your articles. Try again or return to the newest
        articles.
      </p>
      {children}
      <p>
        <Link href={newestHref} prefetch={false}>
          Newest articles
        </Link>
      </p>
    </section>
  );
}
