import { expect, test } from '@playwright/test';
import { useAccessFixture } from '../fixtures/access-surfaces';
import { projectId } from '../fixtures/application';

test('evaluation dialog returns keyboard focus to its launch action', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useAccessFixture(page);
  await page.goto(`/app/projects/${projectId}/sessions`);
  const trigger = page.getByRole('button', { name: 'New evaluation', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
