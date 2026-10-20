import { expect, test } from "@playwright/test";
import { expectVisibleFocus } from "./focus";

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

  await page.getByText("Sections", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Features" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
