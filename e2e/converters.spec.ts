import { test, expect } from "@playwright/test";
import { CONVERTERS } from "../src/lib/registry/converters";
import {
  clickConvert,
  drivePlan,
  expectTextResult,
  gotoConverter,
  setFileInput,
  setTextInput,
} from "./helpers";

test.describe("converter catalog coverage", () => {
  test("registry has converters", () => {
    expect(CONVERTERS.length).toBeGreaterThan(50);
  });
});

for (const converter of CONVERTERS) {
  const plan = drivePlan(converter);

  test.describe(`${converter.group}/${converter.slug}`, () => {
    test(`page loads [${converter.slug}]: ${converter.title}`, async ({ page }) => {
      await gotoConverter(page, converter);
      await expect(page.getByTestId("converter-title")).toHaveText(converter.title);
      await expect(page).toHaveURL(new RegExp(`${converter.group}/${converter.slug}`));
    });

    if (plan.kind === "coming-soon") {
      test(`coming soon [${converter.slug}]`, async ({ page }) => {
        await gotoConverter(page, converter);
        await expect(page.getByTestId("coming-soon-alert")).toBeVisible();
        await expect(page.getByTestId("convert-button")).toHaveCount(0);
      });
    } else {
      test(`convert [${converter.slug}]: ${plan.kind}`, async ({ page }) => {
        test.setTimeout(converter.engine === "ffmpeg" ? 180_000 : 90_000);
        await gotoConverter(page, converter);

        if (plan.kind === "smoke") {
          await expect(page.getByTestId("convert-button")).toBeVisible();
          if (converter.slug === "heic-to-jpg") {
            await clickConvert(page);
            await expect(page.getByText(/Choose a HEIC|Choose an|failed|Error/i).first()).toBeVisible({
              timeout: 10_000,
            });
          }
          return;
        }

        if (plan.labels) {
          for (const [label, value] of Object.entries(plan.labels)) {
            const field = page.getByLabel(label, { exact: false });
            if ((await field.count()) > 0) {
              await field.fill(value);
            }
          }
        }

        if (plan.files?.length) {
          await setFileInput(page, ...plan.files);
        }

        if (
          plan.text !== undefined &&
          (converter.inputMode === "text" || converter.inputMode === "both")
        ) {
          await setTextInput(page, plan.text);
        }

        if (plan.kind === "download") {
          if (plan.text !== undefined && converter.inputMode === "both" && !plan.files?.length) {
            await setTextInput(page, plan.text);
          }
          const downloadPromise = page.waitForEvent("download", { timeout: 160_000 }).catch(async () => {
            const err = page.getByTestId("convert-error");
            const msg =
              (await err.textContent().catch(() => null)) ||
              (await page.locator('[data-slot="alert-description"]').last().textContent().catch(() => null)) ||
              "no download and no error";
            throw new Error(`Download missing for ${converter.slug}: ${msg}`);
          });
          await clickConvert(page);
          const download = await downloadPromise;
          expect(download.suggestedFilename().length).toBeGreaterThan(0);
          return;
        }

        if (plan.kind === "multi") {
          await clickConvert(page);
          await expect(page.getByRole("button", { name: "Download" }).first()).toBeVisible({
            timeout: 60_000,
          });
          return;
        }

        if (plan.kind === "text") {
          await clickConvert(page);
          if (plan.expectText) {
            await expectTextResult(page, plan.expectText);
          } else {
            await expect(page.getByTestId("text-result")).toBeVisible();
          }
        }
      });
    }
  });
}
