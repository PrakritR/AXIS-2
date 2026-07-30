import type { Locator, Page } from "@playwright/test";

/** Open a FieldSingleSelect (data-attr="select-*") and choose an option by visible label. */
export async function pickFieldSelect(
  page: Page,
  trigger: Locator,
  optionName: string | RegExp,
) {
  await trigger.click();
  await page.getByRole("option", { name: optionName }).click();
}

export function fieldSelectTrigger(scope: Locator, dataAttr: string): Locator {
  return scope.locator(`[data-attr="${dataAttr}"]`);
}
