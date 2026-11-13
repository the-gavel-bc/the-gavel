import { expect, test, type Page } from "@playwright/test";

// The navigation skeleton must only cover genuinely slow loads, and must never
// appear over a page that has already rendered. These use only the shell's
// always-present Home and About links, so they need no fixture data.

const skeleton = (page: Page) => page.locator("[data-skeleton]");

async function primaryLink(page: Page, name: string) {
  const menu = page.locator("header details").first();
  if (!(await menu.evaluate((node) => (node as HTMLDetailsElement).open)))
    await menu.locator(":scope > summary").click();
  return page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name, exact: true });
}

// Watches the DOM for `ms` and reports whether a skeleton appeared at any
// moment, so a late skeleton (after the page loaded) cannot slip through.
async function skeletonSeenWithin(page: Page, ms: number) {
  return page.evaluate(
    (duration) =>
      new Promise<boolean>((resolve) => {
        let seen = !!document.querySelector("[data-skeleton]");
        const observer = new MutationObserver(() => {
          if (document.querySelector("[data-skeleton]")) seen = true;
        });
        observer.observe(document.body, { subtree: true, childList: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(seen);
        }, duration);
      }),
    ms,
  );
}

// Client navigation from About to search inside the same reader layout (the
// case where a stuck skeleton used to appear over the loaded page). The
// suggestion panel always offers "See all results", even with no matches.
async function searchFromNavigation(page: Page) {
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator("#reader-search").fill("zz");
  await page.getByRole("link", { name: "See all results" }).click();
}

test("quick navigations never show a skeleton, even long after loading", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/About/);
  await searchFromNavigation(page);
  await page.waitForURL((url) => url.pathname === "/search");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Well past the 1.5s threshold: a stuck navigation would show here.
  expect(await skeletonSeenWithin(page, 2500)).toBe(false);
  await (await primaryLink(page, "About")).click();
  await page.waitForURL((url) => url.pathname === "/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/About/);
  expect(await skeletonSeenWithin(page, 2500)).toBe(false);
  // Across the home and reader layouts too.
  await (await primaryLink(page, "Home")).click();
  await page.waitForURL((url) => url.pathname === "/");
  expect(await skeletonSeenWithin(page, 2500)).toBe(false);
});

test("a slow navigation shows the destination's skeleton, then the page", async ({
  page,
}) => {
  await page.goto("/search");
  let slow = true;
  // Delay only the client navigation's server response, not prefetches.
  await page.route("**/about**", async (route) => {
    const headers = route.request().headers();
    if (slow && headers.rsc === "1" && !headers["next-router-prefetch"])
      await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await (await primaryLink(page, "About")).click();
  await expect(skeleton(page)).toHaveAttribute("data-skeleton", "page");
  await expect(page.getByRole("status")).toHaveText("Loading");
  await page.waitForURL((url) => url.pathname === "/about", {
    timeout: 10_000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/About/);
  await expect(skeleton(page)).toHaveCount(0);
  slow = false;
  expect(await skeletonSeenWithin(page, 2500)).toBe(false);
});
