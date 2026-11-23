export const LETTERS_SECTION_SLUG = "letter-to-the-editor";

export function isLettersSection(section: { slug: string }): boolean {
  return section.slug === LETTERS_SECTION_SLUG;
}

export function sectionHref(section: { name: string; slug: string }): string {
  return isLettersSection(section)
    ? "/letters"
    : `/sections/${encodeURIComponent(section.slug)}`;
}
