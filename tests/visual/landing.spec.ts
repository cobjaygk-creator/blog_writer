import { expect, test } from "@playwright/test";

/**
 * Visual smoke: marketing landing + auth shells.
 * Run with app up: `npm run dev` then `npm run test:visual`
 * Update baselines: `npm run test:visual -- --update-snapshots`
 */
test.describe("visual regression", () => {
  test("landing hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveScreenshot("landing.png", {
      fullPage: true,
    });
  });

  test("login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await expect(page).toHaveScreenshot("login.png", {
      fullPage: true,
    });
  });

  test("register form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "회원가입" })).toBeVisible();
    await expect(page).toHaveScreenshot("register.png", {
      fullPage: true,
    });
  });
});
