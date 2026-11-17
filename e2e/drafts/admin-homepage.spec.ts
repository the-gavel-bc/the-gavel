import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "homepage");
  fixture.setup();
  if (info.project.name === "desktop") fixture.prepareHomepage();
});
test.afterAll(() => fixture?.cleanup());

test("administrator saves ordered published homepage selections", async ({
  context,
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Only one project mutates the shared homepage configuration.",
  );
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/homepage");
  const lead = `${fixture.label} own 20`;
  const featured = `${fixture.label} own 21`;
  await page.getByRole("button", { name: `Set ${lead} as lead` }).click();
  await page.getByLabel("Search titles").fill("own 21");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Published stories" }).getByText(featured),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Lead story" }).getByText(lead),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Add ${featured} to Featured News` })
    .click();
  await page.getByRole("button", { name: "Save homepage selections" }).click();
  await expect(page.getByText("Homepage selections saved.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Lead story" }).getByText(lead),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Featured News" }).getByText(featured),
  ).toBeVisible();
});
test("administrator sees published candidates; author cannot open curation", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard/admin/homepage");
  await expect(page.getByText("Administrator access required.")).toBeVisible();
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/homepage");
  await expect(
    page.getByRole("heading", { name: "Homepage" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Published stories" })
      .getByText(`${fixture.label} own 20`, { exact: true }),
  ).toBeVisible();
  if (info.project.name === "mobile") {
    await page
      .getByRole("button", { name: `Set ${fixture.label} own 20 as lead` })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove lead" }),
    ).toBeVisible();
  }
  await expect(
    page
      .getByRole("region", { name: "Published stories" })
      .getByText(`${fixture.label} own 19`),
  ).toHaveCount(0);
  expect(info.project.name).toMatch(/desktop|mobile/);
});
