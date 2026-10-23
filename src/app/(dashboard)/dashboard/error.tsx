"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button/button";
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section aria-label="Article loading error">
      <p role="alert">
        Unable to load your articles. Try again or return to the newest
        articles.
      </p>
      <Button onClick={reset}>Try again</Button>
      <p>
        <Link href="/dashboard" prefetch={false}>
          Newest articles
        </Link>
      </p>
    </section>
  );
}
