import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";
test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "site");
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());
test("administrator saves site information", async ({
  context,
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Both projects share one settings record.",
  );
  fixture.ensureSiteUnset();
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/site");
  await expect(
    page.getByRole("textbox", { name: "Mission", exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Contact email")).toHaveValue("");
  await expect(page.getByLabel("Instagram URL")).toHaveValue("");
  await expect(page.getByLabel("Submission instructions")).toHaveValue("");
  await page
    .getByRole("textbox", { name: "Mission", exact: true })
    .fill("Synthetic Task 14 browser mission");
  await page.getByRole("button", { name: "Save site information" }).click();
  await expect(page.getByText("Site information saved.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Mission", exact: true }),
  ).toHaveValue("Synthetic Task 14 browser mission");
});
test("administrator can open settings and authors cannot", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/site");
  await expect(page.getByLabel("Instagram URL")).toBeVisible();
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard/admin/site");
  await expect(page.getByText("Administrator access required.")).toBeVisible();
});
