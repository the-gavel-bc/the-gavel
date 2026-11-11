import { expect, test } from "@playwright/test";

for (const javaScriptEnabled of [false, true]) {
  test(`homepage and other public routes retain one shell (JavaScript ${javaScriptEnabled})`, async ({
    browser,
  }, info) => {
    const context = await browser.newContext({
      ...info.project.use,
      javaScriptEnabled,
    });
    try {
      const page = await context.newPage();
      const assertShell = async () => {
        await expect(page.getByRole("main")).toHaveCount(1);
        await expect(page.getByRole("banner")).toHaveCount(1);
        await expect(page.getByRole("contentinfo")).toHaveCount(1);
        await expect(page.getByRole("main")).toHaveAttribute("tabindex", "-1");
      };
      const response = await page.goto("/");
      expect(response?.status()).toBe(200);
      expect(response?.headers()["cache-control"]).toContain("no-store");
      await assertShell();
      await expect(
        page.getByRole("heading", { level: 1, name: "The Gavel", exact: true }),
      ).toBeAttached();
      await page
        .getByRole("contentinfo")
        .getByRole("link", { name: "About", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "About The Gavel" }),
      ).toBeVisible();
      await assertShell();
      await page
        .getByRole("banner")
        .getByRole("link", { name: "The Gavel", exact: true })
        .click();
      await expect(page).toHaveURL(/\/$/);
      await assertShell();
      const missing = await page.goto("/public-shell-missing-20261111");
      expect(missing?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: "Page not found" }),
      ).toBeVisible();
      await assertShell();
      await page
        .getByRole("main")
        .getByRole("link", { name: "Home", exact: true })
        .click();
      await expect(page).toHaveURL(/\/$/);
      await assertShell();
    } finally {
      await context.close();
    }
  });
}
