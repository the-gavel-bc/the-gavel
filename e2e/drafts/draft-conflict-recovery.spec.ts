import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";
test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>, reviewActionId: string;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "recover");
  fixture.setup();
  fixture.setupSelections();
});
test.afterAll(() => fixture?.cleanup());
test("independent owner and admin tabs review conflicts and deliberately adopt a current version", async ({
  context,
  page,
  browser,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  const path = `/dashboard/articles/${fixture.id(15)}`;
  await page.goto(path);
  const other = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: page.viewportSize(),
    isMobile: info.project.name === "mobile",
    hasTouch: info.project.name === "mobile",
  });
  try {
    await setLocalSession(other, fixture.users.admin);
    const admin = await other.newPage();
    await admin.goto(path);
    await admin.getByLabel("Title (required)").fill("Admin local changes");
    await admin
      .getByRole("textbox", { name: "Article body" })
      .fill("Admin local body.");
    await page.getByLabel("Title (required)").fill("Owner saved version");
    await page
      .getByRole("textbox", { name: "Article body" })
      .fill("Owner saved body.");
    await page
      .getByLabel(`Synthetic ${info.project.name} category`, { exact: true })
      .check();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Draft saved" }),
    ).toBeVisible();
    await admin.getByRole("button", { name: "Save draft" }).click();
    await expect(
      admin.getByRole("alert").filter({ hasText: "changed elsewhere" }),
    ).toBeVisible();
    fixture.setCategoryActive(false);
    admin.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) {
        const args = JSON.parse(request.postData()!);
        if (args[0] === fixture.id(15))
          reviewActionId = request.headers()["next-action"];
      }
    });
    await admin
      .getByRole("button", { name: "Review latest saved version" })
      .click();
    await expect(
      admin.getByRole("heading", { name: "Latest saved version (2)" }),
    ).toBeVisible();
    await expect(admin.getByLabel("Title (required)")).toHaveValue(
      "Admin local changes",
    );
    admin.once("dialog", (dialog) => dialog.dismiss());
    await admin
      .getByRole("button", { name: "Load latest saved version" })
      .click();
    await expect(admin.getByLabel("Title (required)")).toHaveValue(
      "Admin local changes",
    );
    admin.once("dialog", (dialog) => dialog.accept());
    await admin
      .getByRole("button", { name: "Load latest saved version" })
      .click();
    await expect(admin.getByLabel("Title (required)")).toHaveValue(
      "Owner saved version",
    );
    await expect(admin.getByLabel("Title (required)")).toBeFocused();
    await expect(
      admin.getByRole("textbox", { name: "Article body" }),
    ).toHaveText("Owner saved body.");
    await expect(
      admin.getByText("Admin local body.", { exact: true }),
    ).toBeVisible();
    const missing = admin.getByLabel(
      `Unavailable category: ${fixture.id(97)}`,
      { exact: true },
    );
    await expect(missing).toBeChecked();
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await admin.evaluate(() => window.scrollTo(0, 0));
    await admin.screenshot({
      path: `docs/reviews/assets/phase-3-task10-${info.project.name}.png`,
      fullPage: true,
    });
    await missing.click();
    await admin
      .getByLabel("Title (required)")
      .fill("Manually reconciled changes");
    await admin.getByRole("button", { name: "Save draft" }).click();
    await expect(
      admin.getByRole("status").filter({ hasText: "Draft saved" }),
    ).toBeVisible();
    expect(fixture.article(15)).toMatchObject({
      article: { title: "Manually reconciled changes", edit_version: 3 },
      revisions: 2,
      audits: 2,
      receipts: 2,
    });
  } finally {
    fixture.setCategoryActive(true);
    await other.close();
  }
});
test("unsupported and read-only recovery preserve local input and disable saving", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  for (const number of [18, 12]) {
    page.once("dialog", (dialog) => dialog.accept());
    await page.goto(`/dashboard/articles/${fixture.id(number)}`);
    page.removeAllListeners("dialog");
    await page
      .getByLabel("Title (required)")
      .fill(`Retained local input ${number}`);
    await expect(
      page.getByRole("status").filter({ hasText: "Unsaved changes" }),
    ).toBeVisible();
    if (number === 18) fixture.legacy();
    else fixture.makeReadOnly(number);
    const before = fixture.article(number);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page
      .getByRole("button", { name: "Review latest saved version" })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "no longer available for editing" }),
    ).toBeVisible();
    await expect(page.getByLabel("Title (required)")).toHaveValue(
      `Retained local input ${number}`,
    );
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeDisabled();
    expect(fixture.article(number)).toEqual(before);
  }
});
test("dirty app links sign-out and reload can be canceled while clean navigation remains available", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  const path = `/dashboard/articles/${fixture.id(14)}`;
  await page.goto(path);
  const title = page.getByLabel("Title (required)");
  await title.fill("Keep this unsaved input");
  let dialogs = 0,
    posts = 0;
  const dismiss = async (dialog: import("@playwright/test").Dialog) => {
    dialogs++;
    await dialog.dismiss();
  };
  page.on("dialog", dismiss);
  page.on("request", (request) => {
    if (request.method() === "POST") posts++;
  });
  for (const name of ["My articles", "Back to My articles"]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(title).toHaveValue("Keep this unsaved input");
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  expect(dialogs).toBe(3);
  expect(posts).toBe(0);
  const newTabModifier = process.platform === "darwin" ? "Meta" : "Control";
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page
      .getByRole("link", { name: "My articles", exact: true })
      .click({ modifiers: [newTabModifier] }),
  ]);
  await popup.waitForLoadState("domcontentloaded");
  await popup.close();
  expect(dialogs).toBe(3);
  // Trigger reload without waiting for a navigation that the user deliberately cancels.
  await page.evaluate(() => window.location.reload());
  expect(dialogs).toBe(4);
  await expect(title).toHaveValue("Keep this unsaved input");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My articles", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(dialogs).toBe(4);
  page.off("dialog", dismiss);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});
test("credited non-owner and signed-out callers cannot recover a private snapshot through the action", async ({
  context,
  page,
}) => {
  expect(reviewActionId).toBeTruthy();
  fixture.creditOther();
  const before = fixture.article(21);
  await setLocalSession(context, fixture.users.other);
  const path = `/dashboard/articles/${fixture.id(21)}`;
  expect((await page.goto(path))?.status()).toBe(404);
  const invoke = () =>
    page.request.post(path, {
      headers: {
        "Next-Action": reviewActionId,
        Origin: "http://127.0.0.1:3100",
        "Content-Type": "text/plain;charset=UTF-8",
      },
      data: JSON.stringify([fixture.id(21)]),
    });
  const hidden = await (await invoke()).text();
  expect(hidden).toContain("notFound");
  expect(hidden).not.toContain(before.article.title);
  await context.clearCookies();
  const denied = await (await invoke()).text();
  expect(denied).toContain("forbidden");
  expect(denied).not.toContain(before.article.title);
  expect(fixture.article(21)).toEqual(before);
});
