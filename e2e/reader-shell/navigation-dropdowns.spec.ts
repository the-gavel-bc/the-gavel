import { expect, test, type Page } from "@playwright/test";

// Category dropdowns at phone, tablet and desktop widths. Uses whichever
// section the seeded taxonomy lists first that has categories.

async function openMenuIfCollapsed(page: Page) {
  const menu = page.locator("header details").first();
  if (!(await menu.evaluate((node) => (node as HTMLDetailsElement).open)))
    await menu.locator(":scope > summary").click();
}

async function firstDropdown(page: Page) {
  const summary = page
    .getByRole("navigation", { name: "Primary navigation" })
    .locator("li details > summary")
    .first();
  await expect(summary).toBeVisible();
  const item = summary.locator("xpath=ancestor::li[1]");
  return {
    summary,
    details: summary.locator("xpath=.."),
    sectionLink: item.locator(":scope > a"),
    firstCategory: summary.locator("xpath=..").locator("ul a").first(),
  };
}

for (const [label, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["tablet", { width: 810, height: 1080 }],
  ["desktop", { width: 1440, height: 900 }],
] as const) {
  test(`${label}: a category dropdown opens on screen, closes outside, and navigates`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await openMenuIfCollapsed(page);
    const dropdown = await firstDropdown(page);
    // Position of the section link within its row, unaffected by scrolling.
    const linkInRow = () =>
      dropdown.sectionLink.evaluate((link) => {
        const row = link.parentElement!.getBoundingClientRect();
        const box = link.getBoundingClientRect();
        // Whole pixels: subpixel layout noise is not a shift.
        return {
          x: Math.round(box.x - row.x),
          y: Math.round(box.y - row.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      });
    const linkBefore = await linkInRow();

    await dropdown.summary.click();
    await expect(dropdown.firstCategory).toBeVisible();
    // Opening must not move the section link or push the list off screen.
    expect(await linkInRow()).toEqual(linkBefore);
    const list = (await dropdown.details.locator("ul").boundingBox())!;
    expect(list.x).toBeGreaterThanOrEqual(0);
    expect(list.x + list.width).toBeLessThanOrEqual(viewport.width);
    // The caret stays on the section link's row.
    const link = (await dropdown.sectionLink.boundingBox())!;
    const caret = (await dropdown.summary.boundingBox())!;
    const caretMiddle = caret.y + caret.height / 2;
    expect(caretMiddle).toBeGreaterThan(link.y);
    expect(caretMiddle).toBeLessThan(link.y + link.height);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);

    // A tap elsewhere closes it.
    await page.mouse.click(5, viewport.height - 5);
    await expect(dropdown.details).not.toHaveAttribute("open");

    // Reopen and follow a category.
    await openMenuIfCollapsed(page);
    await dropdown.summary.click();
    const href = await dropdown.firstCategory.getAttribute("href");
    await dropdown.firstCategory.click();
    await page.waitForURL((url) => url.pathname === href);
  });
}
