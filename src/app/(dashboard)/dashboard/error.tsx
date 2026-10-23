"use client";
import { ArticleListError } from "@/components/dashboard/article-list-error/article-list-error";
import { Button } from "@/components/ui/button/button";
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ArticleListError>
      <Button onClick={reset}>Try again</Button>
    </ArticleListError>
  );
}
