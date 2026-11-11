// Preserve the approved label rule until taxonomy has a stable letters identifier.
export function isLettersSection(section: { name: string }): boolean {
  return section.name.toLowerCase() === "letter to the editor";
}

export function sectionHref(section: { name: string; slug: string }): string {
  return isLettersSection(section)
    ? "/letters"
    : `/sections/${encodeURIComponent(section.slug)}`;
}
