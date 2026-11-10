import Link from "next/link";
import type { PublicArchiveContext } from "@/backend/public-articles/public-archive/public-archive";
import styles from "./category-chips.module.css";
export function CategoryChips({ archive }: { archive: PublicArchiveContext }) {
  if (!archive.section.categories.length) return null;
  return (
    <nav aria-label="Categories" className={styles.chips}>
      <ul>
        <li>
          <Link
            href={
              archive.category
                ? `/sections/${archive.section.slug}`
                : archive.href
            }
            aria-current={!archive.category ? "page" : undefined}
          >
            All stories
          </Link>
        </li>
        {archive.section.categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/sections/${archive.section.slug}/categories/${category.slug}`}
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
