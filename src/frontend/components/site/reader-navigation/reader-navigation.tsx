"use client";
import {
  isLettersSection,
  sectionHref,
} from "@/shared/reader/section-link/section-link";
import { useEffect, useRef, type PointerEvent } from "react";
import { SearchForm } from "@/frontend/features/reader/components/search-form/search-form";
import { usePathname } from "next/navigation";
import { DeskLink } from "../desk-link/desk-link";
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
    // Only an enhanced menu overlays the page; without JavaScript it stays in flow.
    menu.current?.setAttribute("data-enhanced", "");
    const wide = window.matchMedia("(min-width: 45rem)");
    const synchronize = () => {
      if (menu.current) menu.current.open = wide.matches;
    };
    synchronize();
    wide.addEventListener("change", synchronize);
    return () => wide.removeEventListener("change", synchronize);
  }, []);
  // Desktop mouse users get dropdowns on hover; click and keyboard still toggle.
  const hover = (event: PointerEvent<HTMLLIElement>, open: boolean) => {
    if (
      event.pointerType !== "mouse" ||
      !window.matchMedia?.("(min-width: 45rem)").matches
    )
      return;
    const detail = event.currentTarget.querySelector("details");
    if (detail) detail.open = open;
  };
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
          <summary className={styles.toggle}>
            <span aria-hidden="true" className={styles.burger}>
              <span />
              <span />
              <span />
            </span>
            <span className={styles.srOnly}>Menu</span>
          </summary>
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
                // Dropdown entries: the section's categories, plus the
                // submission page under Letter to the Editor (as on the live site).
                const items = [
                  ...section.categories.map((category) => ({
                    key: category.slug,
                    name: category.name,
                    path: `${sectionPath}/categories/${encodeURIComponent(category.slug)}`,
                  })),
                  ...(isLettersSection(section)
                    ? [
                        {
                          key: "how-to-submit",
                          name: "How to Submit",
                          path: "/letters/how-to-submit",
                        },
                      ]
                    : []),
                ];
                return (
                  <li
                    key={section.slug}
                    className={styles.section}
                    onPointerEnter={(event) => hover(event, true)}
                    onPointerLeave={(event) => hover(event, false)}
                  >
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
                    {items.length > 0 && (
                      <details className={styles.categories}>
                        <summary>
                          <span aria-hidden="true" className={styles.caret} />
                          <span className={styles.srOnly}>
                            {isLettersSection(section) &&
                            !section.categories.length
                              ? "Links"
                              : "Categories"}{" "}
                            for {section.name}
                          </span>
                        </summary>
                        <ul>
                          {items.map((item) => (
                            <li key={item.key}>
                              <Link
                                href={item.path}
                                aria-current={current(item.path)}
                              >
                                {item.name}
                              </Link>
                            </li>
                          ))}
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
        <DeskLink />
      </div>
    </div>
  );
}
