import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "contributors");
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());

test("administrator creates, edits, and deactivates a guest without a slug field", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/contributors");
  const project = info.project.name;
  const create = page.getByRole("region", { name: "Create guest contributor" });
  await expect(create.getByLabel("Public display name")).toBeVisible();
  await expect(create.getByLabel("Slug")).toHaveCount(0);
  await create
    .getByLabel("Public display name")
    .fill(`Task Ten Guest ${project}`);
  await create.getByLabel("Public biography").fill("Guest writer biography.");
  await create.getByRole("button", { name: "Create contributor" }).click();
  const guest = page
    .getByRole("listitem")
    .filter({ hasText: `task-ten-guest-${project}` });
  await expect(
    guest.getByText(`Author URL: /authors/task-ten-guest-${project}`),
  ).toBeVisible();
  await guest
    .getByLabel("Public display name")
    .fill(`Task Ten Edited ${project}`);
  await guest.getByRole("button", { name: "Save contributor" }).click();
  const edited = page
    .getByRole("listitem")
    .filter({ hasText: `task-ten-edited-${project}` });
  await expect(
    edited.getByText(`Author URL: /authors/task-ten-edited-${project}`),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await edited.getByRole("button", { name: "Deactivate contributor" }).click();
  await expect(edited.getByText("Inactive", { exact: true })).toBeVisible();
});

test("author cannot open admin contributors; invalid cursor offers reset", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard/admin/contributors");
  await expect(page.getByText("Administrator access required.")).toBeVisible();
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/contributors?cursor=bad");
  await expect(page.getByText("Unable to load contributors.")).toBeVisible();
  await page.getByRole("link", { name: "Reset filter" }).click();
  await expect(
    page.getByRole("heading", { name: "Contributors" }),
  ).toBeVisible();
});
