import { expect, type Page } from '@playwright/test';

/** The language switch lives in the account menu: open it, flip the language, close it. */
export async function toggleLanguage(page: Page) {
  await page.getByRole('button', { name: /^(Account|บัญชี)/ }).click();
  await page.getByRole('menuitem', { name: /^(Interface language|ภาษาของหน้าจอ)/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}
