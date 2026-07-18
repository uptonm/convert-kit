import { test, expect } from "@playwright/test";
import { GROUPS } from "../src/lib/registry/groups";

test("home shows ConvertKit and catalog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("ConvertKit").first()).toBeVisible();
  await expect(page.getByPlaceholder(/Search converters/i)).toBeVisible();
});

for (const group of GROUPS) {
  test(`group hub: ${group.slug}`, async ({ page }) => {
    await page.goto(`/${group.slug}`);
    await expect(page.getByRole("heading", { name: group.name })).toBeVisible();
  });
}

test("privacy page", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await expect(page.getByText(/not uploaded to a third-party conversion service/i)).toBeVisible();
});
