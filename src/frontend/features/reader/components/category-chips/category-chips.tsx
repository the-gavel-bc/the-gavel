import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import type { PublicArchiveContext } from "@/backend/public-articles/public-archive/public-archive";
import styles from "./category-chips.module.css";
export function CategoryChips({ archive }: { archive: PublicArchiveContext }) {
  const { section } = archive;
  if (!section?.categories.length) return null;
  return (
    <nav aria-label="Categories" className={styles.chips}>
      <ul>
        <li>
          <Link
            href={sectionHref(section)}
            aria-current={!archive.category ? "page" : undefined}
          >
            All stories
          </Link>
        </li>
        {section.categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/sections/${section.slug}/categories/${category.slug}`}
              aria-current={
                archive.category?.slug === category.slug ? "page" : undefined
              }
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
