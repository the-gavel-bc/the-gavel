import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "audit");
  fixture.setup();
  fixture.seedAudit();
});
test.afterAll(() => fixture?.cleanup());

test("administrator filters and pages article activity with keyboard controls", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/articles");
  await page.getByRole("link", { name: "Article activity" }).click();
  await expect(
    page.getByRole("heading", { name: "Article activity" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Filter activity" })
    .getByRole("link", { name: "Archived" })
    .click();
  const archived = page.getByRole("link", { name: "Archived", exact: true });
  await expect(archived).toHaveAttribute("aria-current", "page");
  await expect(page.locator("ol").getByText("Archived").first()).toBeVisible();
  await expect(page.getByText(/Synthetic list member ·/).first()).toBeVisible();
  const next = page.getByRole("link", { name: "Next page" });
  await next.focus();
  await expect(next).toBeFocused();
  await next.press("Enter");
  await expect(page).toHaveURL(/cursor=.*&action=article\.archived/);
  await expect(
    page.getByRole("link", { name: "Archived", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("ol").getByText("Archived").first()).toBeVisible();
});

test("author and inactive administrator cannot read the audit route", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard/admin/audit");
  await expect(page.getByText("Administrator access required.")).toBeVisible();
  await setLocalSession(context, fixture.users.admin);
  fixture.setAdminAccess(false);
  await page.goto("/dashboard/admin/audit");
  await expect(page).toHaveURL(/access-pending/);
  fixture.setAdminAccess(true);
});

test("invalid cursor has a safe reset link", async ({ context, page }) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/audit?cursor=bad");
  await expect(page.getByText(/Unable to load article activity/)).toBeVisible();
  await page.getByRole("link", { name: "Reset filter" }).click();
  await expect(
    page.getByRole("heading", { name: "Article activity" }),
  ).toBeVisible();
});
