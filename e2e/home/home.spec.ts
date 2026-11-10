import { expect, test } from "@playwright/test";
import { expectVisibleFocus } from "../support/focus/focus";

test("homepage exposes its accessible foundation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "The Gavel" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toHaveAttribute("href", "#main-content");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();

  await expectVisibleFocus(page.getByRole("link", { name: "Skip to content" }));

  const menu = page.locator("header details").first();
  if ((page.viewportSize()?.width ?? 0) < 720) {
    // Mobile progressively collapses after hydration; taxonomy is configured
    // data, so this foundation check must not assume a seeded section exists.
    await expect(menu).not.toHaveAttribute("open");
    await menu.locator(":scope > summary").press("Enter");
  }
  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  const home = navigation.getByRole("link", { name: "Home", exact: true });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("link", { name: "About", exact: true }),
  ).toHaveAttribute("href", "/about");
  await home.focus();
  await expectVisibleFocus(home);
  await expect(page.getByRole("search")).toHaveAttribute("method", "get");

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
