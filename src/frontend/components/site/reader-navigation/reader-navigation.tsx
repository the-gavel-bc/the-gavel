"use client";
import { sectionHref } from "@/shared/reader/section-link/section-link";
import { useEffect, useRef } from "react";
import { SearchForm } from "@/frontend/features/reader/components/search-form/search-form";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { PublicSection } from "@/shared/reader/site-navigation/site-navigation";
import styles from "./reader-navigation.module.css";

export function ReaderNavigation({ sections }: { sections: PublicSection[] }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  // SSR starts expanded so navigation is usable without JavaScript.
  // Progressive enhancement collapses only the narrow-screen disclosure.
  useEffect(() => {
    if (!window.matchMedia) return;
    const wide = window.matchMedia("(min-width: 45rem)");
    const synchronize = () => {
      if (menu.current) menu.current.open = wide.matches;
    };
    synchronize();
    wide.addEventListener("change", synchronize);
    return () => wide.removeEventListener("change", synchronize);
  }, []);
  const current = (href: string) =>
    pathname === href ? ("page" as const) : undefined;
  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <details
          ref={menu}
          className={styles.menu}
          open
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            const detail = (
              event.target as HTMLElement
            ).closest<HTMLDetailsElement>("details[open]");
            if (!detail) return;
            // The outer desktop disclosure is the persistent primary navigation.
            if (
              detail === menu.current &&
              window.matchMedia?.("(min-width: 45rem)").matches
            )
              return;
            detail.open = false;
            detail.querySelector("summary")?.focus();
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <summary className={styles.toggle}>Menu</summary>
          <nav aria-label="Primary navigation">
            <ul className={styles.links}>
              <li>
                <Link href="/" aria-current={current("/")}>
                  Home
                </Link>
              </li>
              <li>
                <Link href="/about" aria-current={current("/about")}>
                  About
                </Link>
              </li>
              {sections.map((section) => {
                const href = sectionHref(section);
                const sectionPath = `/sections/${encodeURIComponent(section.slug)}`;
                return (
                  <li key={section.slug} className={styles.section}>
                    <Link
                      href={href}
                      aria-current={current(href)}
                      data-active={
                        pathname?.startsWith(sectionPath + "/") ||
                        pathname?.startsWith(href + "/") ||
                        undefined
                      }
                    >
                      {section.name}
                    </Link>
                    {section.categories.length > 0 && (
                      <details className={styles.categories}>
                        <summary>
                          Categories
                          <span className={styles.srOnly}>
                            {" "}
                            for {section.name}
                          </span>
                        </summary>
                        <ul>
                          {section.categories.map((category) => {
                            const path = `${sectionPath}/categories/${encodeURIComponent(category.slug)}`;
                            return (
                              <li key={category.slug}>
                                <Link href={path} aria-current={current(path)}>
                                  {category.name}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </details>
        <SearchForm id="reader-search" navigation />
      </div>
    </div>
  );
}
