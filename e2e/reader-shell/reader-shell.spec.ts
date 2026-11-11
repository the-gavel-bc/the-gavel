import { expect, test } from "@playwright/test";
test("public shell has one main and keyboard-operable navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("contentinfo")).toHaveCount(1);
  const menu = page.locator("header details").first();
  if (!(await menu.evaluate((node) => (node as HTMLDetailsElement).open)))
    await menu.locator(":scope > summary").click();
  const home = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Home", exact: true });
  await expect(home).toHaveAttribute("aria-current", "page");
  await home.focus();
  await page.keyboard.press("Escape");
  if (await page.evaluate(() => matchMedia("(min-width: 45rem)").matches)) {
    await expect(menu).toHaveAttribute("open");
    await expect(home).toBeFocused();
  } else {
    await expect(menu).not.toHaveAttribute("open");
    await expect(menu.locator(":scope > summary")).toBeFocused();
  }
  await expect(page.getByRole("search")).toHaveAttribute("method", "get");
});
test("public links and sign-in shell work without JavaScript", async ({
  browser,
  baseURL,
  viewport,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    viewport,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Member sign in", exact: true })
      .click();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Member sign in" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("search input preserves supported Unicode without JavaScript", async ({
  browser,
  baseURL,
  viewport,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    viewport,
  });
  try {
    const page = await context.newPage();
    await page.goto("/search");
    const input = page
      .getByRole("searchbox", { name: "Search stories", exact: true })
      .last();
    const query = "𐐀".repeat(80) + " " + "𐐀".repeat(79);
    await input.fill(query);
    await expect(input).toHaveValue(query);
    await input.press("Enter");
    await page.waitForURL(
      (url) =>
        url.pathname === "/search" && url.searchParams.get("q") === query,
    );
    await expect(input).toHaveValue(query);
    await input.fill("a".repeat(160));
    await expect(input).toHaveValue("a".repeat(160));
    await input.fill("a".repeat(161));
    await input.press("Enter");
    await expect(
      page.getByText("This search or page link is invalid.", { exact: false }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
