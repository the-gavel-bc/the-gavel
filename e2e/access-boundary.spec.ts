import { expect, test } from "@playwright/test";
import { setLocalSession } from "./local-supabase";

test.use({ javaScriptEnabled: false });

test("direct dashboard navigation denies a signed-out reader without JavaScript", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Member sign in" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "My articles" })).toHaveCount(
    0,
  );
});
for (const [label, user] of [
  ["inactive member", 1],
  ["unapproved Google identity", 5],
  ["non-bc.edu member", 3],
] as const) {
  test(`direct dashboard navigation denies ${label} without JavaScript`, async ({
    context,
    page,
  }) => {
    await setLocalSession(context, user);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/access-pending$/);
    await expect(
      page.getByRole("heading", { name: "Access pending" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "My articles" }),
    ).toHaveCount(0);
  });
}
test("approved author sees empty dashboard without administrator controls", async ({
  context,
  page,
}) => {
  await setLocalSession(context, 2);
  const response = await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "My articles" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(
    0,
  );
  expect(response?.headers()["cache-control"]).toContain("no-store");
});
test("administrator sees administrator navigation", async ({
  context,
  page,
}) => {
  await setLocalSession(context, 4);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: "Administration" }),
  ).toBeVisible();
});
test("forged session cookie cannot reveal dashboard content", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: "base64-eyJhY2Nlc3NfdG9rZW4iOiJmb3JnZWQifQ",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
});
