import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getPublicArticleForRequest } from "@/backend/public-articles/public-article/public-article";
import { getArticleContext } from "@/backend/public-articles/article-context/article-context";
import { ArticleHeader } from "@/frontend/features/reader/components/article-header/article-header";
import { ArticleCredits } from "@/frontend/features/reader/components/article-credits/article-credits";
import { ArticleContext } from "@/frontend/features/reader/components/article-context/article-context";
import { PublicArticleBody } from "@/frontend/features/reader/components/public-article-body/public-article-body";
import styles from "./page.module.css";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicArticleForRequest(slug);
  if (result.kind === "notFound") notFound();
  if (result.kind === "unavailable")
    return {
      title: "Article temporarily unavailable",
      robots: { index: false, follow: false },
    };
  return {
    title: result.article.title,
    description:
      result.article.metaDescription ?? result.article.excerpt ?? undefined,
  };
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
  return (
    <div className={styles.page}>
      <article aria-label={article.title} className={styles.article}>
        <ArticleHeader article={article} />
        <ArticleCredits article={article} />
        <PublicArticleBody
          content={article.content}
          articleId={article.id}
          images={article.bodyImages}
        />
      </article>
      <ArticleContext article={article} related={related} />
    </div>
  );
}
