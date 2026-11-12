import Link from "next/link";
import type { PublicSection } from "@/shared/reader/site-navigation/site-navigation";
import logo from "@/frontend/assets/brand/gavel-logo.png";
import { ReaderNavigation } from "../reader-navigation/reader-navigation";
import styles from "./site-header.module.css";
export function SiteHeader({ sections = [] }: { sections?: PublicSection[] }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.identity} href="/">
          {/* Plain img: next/image adds an inline style attribute the CSP blocks. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo.src}
            width={logo.width}
            height={logo.height}
            alt="The Gavel: the progressive student voice of Boston College"
            fetchPriority="high"
          />
        </Link>
      </div>
      <ReaderNavigation sections={sections} />
    </header>
  );
}
