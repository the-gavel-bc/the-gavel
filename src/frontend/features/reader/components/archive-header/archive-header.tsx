import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import type { PublicArchiveContext } from "@/backend/public-articles/public-archive/public-archive";
import { CategoryChips } from "../category-chips/category-chips";
import styles from "./archive-header.module.css";
export function ArchiveHeader({ archive }: { archive: PublicArchiveContext }) {
  return (
    <header className={styles.header}>
      <nav aria-label="Breadcrumbs">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          {archive.category && (
            <li>
              <Link href={sectionHref(archive.section)}>
                {archive.section.name}
              </Link>
            </li>
          )}
          <li>
            <span aria-current="page">{archive.title}</span>
          </li>
        </ol>
      </nav>
      <h1>{archive.title}</h1>
      {archive.isLetters && (
        <p className={styles.submit}>
          <Link href="/letters/how-to-submit">How to submit a letter</Link>
        </p>
      )}
      <CategoryChips archive={archive} />
    </header>
  );
}
