import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import type { PublicHomepage } from "@/shared/reader/homepage/homepage";
import { ArticleGrid } from "../reader-layout/reader-layout";
import { ArticleCard } from "../article-card/article-card";
import styles from "./home-section.module.css";
export function HomeSection({
  section,
}: {
  section: PublicHomepage["sections"][number];
}) {
  if (!section.articles.length) return null;
  const headingId = `home-section-${section.slug}`;
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.heading}>
        <h2 id={headingId}>{section.name}</h2>
        <Link href={sectionHref(section)}>View all {section.name}</Link>
      </div>
      <ArticleGrid>
        {section.articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </ArticleGrid>
    </section>
  );
}
