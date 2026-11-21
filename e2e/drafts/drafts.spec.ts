import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";
import { expectVisibleFocus } from "../support/focus/focus";

test.describe.configure({ mode: "serial" });
test.use({ javaScriptEnabled: false });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name);
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());
test("author pages through only owned records without JavaScript", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  const response = await page.goto("/dashboard");
  const list = page.getByRole("region", { name: "Your articles" });
  await expect(list.getByRole("listitem")).toHaveCount(20);
  await expect(
    list.getByRole("heading", { name: `${fixture.label} own 21`, exact: true }),
  ).toBeVisible();
  await expect(list.getByText("Published", { exact: true })).toBeVisible();
  await expect(list.getByText("Archived", { exact: true })).toBeVisible();
  await expect(
    list.getByRole("link", {
      name: `Edit draft: ${fixture.label} own 20`,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText(`${fixture.label} other private`, { exact: true }),
  ).toHaveCount(0);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(
    page.getByRole("link", { name: "Create draft" }),
  ).toHaveAttribute("href", "/dashboard/articles/new");
  await expect(
    page.getByRole("link", {
      name: `Edit draft: ${fixture.label} own 21`,
      exact: true,
    }),
  ).toHaveAttribute("href", `/dashboard/articles/${fixture.id(21)}`);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (
      await page
        .getByRole("link", { name: "Create draft" })
        .evaluate((el) => el === document.activeElement)
    )
      break;
  }
  await expectVisibleFocus(page.getByRole("link", { name: "Create draft" }));
  await page.keyboard.press("Tab");
  await expectVisibleFocus(
    page.getByRole("link", {
      name: `Edit draft: ${fixture.label} own 21`,
      exact: true,
    }),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("article-list.png"),
    fullPage: false,
  });
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(
    list.getByRole("heading", { name: `${fixture.label} own 1`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Next page" })).toHaveCount(0);
  await page.getByRole("link", { name: "Newest articles" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(20);
});
test("author and administrator lists stay own-only with another owner's cursor", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard");
  const cursorLink = await page
    .getByRole("link", { name: "Next page" })
    .getAttribute("href");
  await setLocalSession(context, fixture.users.other);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", {
      name: `${fixture.label} other private`,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(cursorLink!);
  await expect(
    page.getByRole("region", { name: "Your articles" }).getByRole("listitem"),
  ).toHaveCount(0);
  await expect(
    page.getByText(`${fixture.label} own 1`, { exact: true }),
  ).toHaveCount(0);
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", {
      name: `${fixture.label} admin own`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your articles" }).getByRole("listitem"),
  ).toHaveCount(1);
  await page.goto(cursorLink!);
  await expect(
    page.getByRole("region", { name: "Your articles" }).getByRole("listitem"),
  ).toHaveCount(0);
  await expect(
    page.getByText(new RegExp(`${fixture.label} (own|other)`)),
  ).toHaveCount(0);
});
test("empty state and invalid-cursor recovery are safe", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.empty);
  await page.goto("/dashboard");
  await expect(
    page.getByText(/You have not created any articles yet/),
  ).toBeVisible();
  await page.goto("/dashboard?cursor=invalid");
  await expect(page.getByRole("alert")).toContainText(
    "Unable to load your articles",
  );
  await page.getByRole("link", { name: "Newest articles" }).click();
  await expect(
    page.getByText(/You have not created any articles yet/),
  ).toBeVisible();
});

test("server read failure offers a working retry without JavaScript", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  fixture.failRead();
  try {
    await page.goto("/dashboard");
    await expect(page.getByRole("alert")).toContainText(
      "Unable to load your articles",
    );
    await expect(
      page.getByText("Synthetic unsupported timestamp", { exact: true }),
    ).toHaveCount(0);
    fixture.recoverRead();
    await page.getByRole("link", { name: "Try again" }).click();
    await expect(
      page.getByRole("region", { name: "Your articles" }).getByRole("listitem"),
    ).toHaveCount(20);
  } finally {
    fixture.recoverRead();
  }
});

test.describe("client pagination", () => {
  test.use({ javaScriptEnabled: true });
  test("announces loading while the next page is pending", async ({
    context,
    page,
  }) => {
    await setLocalSession(context, fixture.users.author);
    await page.goto("/dashboard");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/dashboard?**", async (route) => {
      if (route.request().headers()["rsc"] === "1") await gate;
      await route.continue();
    });
    try {
      const click = page.getByRole("link", { name: "Next page" }).click();
      await expect(page.getByRole("status")).toContainText(
        "Loading your articles",
      );
      release();
      await click;
      await expect(
        page
          .getByRole("region", { name: "Your articles" })
          .getByRole("listitem"),
      ).toHaveCount(1);
      await expect(page.getByRole("status")).toHaveCount(0);
    } finally {
      release();
    }
  });
});
