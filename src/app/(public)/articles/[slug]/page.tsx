import {
  publicArticleMetadata,
  excludedMetadata,
} from "@/backend/reader/public-metadata/public-metadata";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPublicArticleForRequest } from "@/backend/public-articles/public-article/public-article";
import { getArticleContext } from "@/backend/public-articles/article-context/article-context";
import { ReaderArticleFrame } from "@/frontend/features/reader/components/reader-article-frame/reader-article-frame";
import styles from "@/frontend/features/reader/components/reader-article-frame/reader-article-frame.module.css";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicArticleForRequest(slug);
  if (result.kind === "notFound") notFound();
  if (result.kind === "unavailable")
    return excludedMetadata("Article temporarily unavailable");
  return publicArticleMetadata(result.article);
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  // No loading boundary: decide public eligibility before streaming a success response.
  const result = await getPublicArticleForRequest(slug);
  if (result.kind === "notFound") notFound();
  if (result.kind === "unavailable")
    return (
      <div className={styles.page}>
        <h1>Article temporarily unavailable</h1>
        <p>Please try again in a moment.</p>
        <Link href={`/articles/${encodeURIComponent(slug)}`}>Try again</Link>
      </div>
    );
  const article = result.article;
  const related = await getArticleContext(article.id, article.section.slug);
  return <ReaderArticleFrame article={article} related={related} />;
}
