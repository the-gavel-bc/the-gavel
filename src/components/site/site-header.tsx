import Link from "next/link";

const sections = [
  ["Features", "/sections/features"],
  ["Opinions", "/sections/opinions"],
  ["Culture", "/sections/culture"],
  ["Sports", "/sections/sports"],
  ["Allston-Brighton", "/sections/allston-brighton"],
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-identity" href="/">
          The Gavel
        </Link>
        <details className="site-menu">
          <summary>Sections</summary>
          <nav aria-label="Primary navigation">
            <ul>
              {sections.map(([label, href]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
        <Link className="site-header__sign-in" href="/sign-in">
          Member sign in
        </Link>
      </div>
    </header>
  );
}
