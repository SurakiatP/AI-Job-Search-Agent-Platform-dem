import { type Page } from '@playwright/test';

/** The language toggle is a visible button (sidebar on desktop, header on phones) that names the other language. */
export async function toggleLanguage(page: Page) {
  await page.getByRole('button', { name: /^(Interface language|ภาษาของหน้าจอ):/ }).filter({ visible: true }).first().click();
}
