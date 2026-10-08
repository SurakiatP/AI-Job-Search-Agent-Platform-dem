import { expect, test } from '@playwright/test';
import { documentId, projectId, useSyntheticApplication } from '../fixtures/application';

const sourceCvOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceCvTwo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sourceCvThree = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('shows each generated document revision source instead of the current CV after a language switch', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/cv`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: sourceCvThree, revision: 3, created_at: '2026-10-03T00:00:00Z', original_filename: 'synthetic-cv-three.txt', mime_type: 'text/plain', size_bytes: 40 },
      { id: sourceCvTwo, revision: 2, created_at: '2026-10-02T00:00:00Z', original_filename: 'synthetic-cv-two.txt', mime_type: 'text/plain', size_bytes: 40 },
      { id: sourceCvOne, revision: 1, created_at: '2026-10-01T00:00:00Z', original_filename: 'synthetic-cv-one.txt', mime_type: 'text/plain', size_bytes: 40 },
    ]),
  }));
  await page.route(`**/api/v1/projects/${projectId}/documents`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: documentId,
      document_type: 'cover_letter',
      title: 'Synthetic partial cover letter',
      latest_revision: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', revision: 2 },
      content_markdown: 'Synthetic partial content.',
      output_language: 'en',
      partial: true,
    }]),
  }));
  await page.route(`**/api/v1/projects/${projectId}/documents/${documentId}/revisions`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', document_id: documentId, revision: 1, source_cv_revision_id: sourceCvOne, file_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', content_markdown: 'Earlier synthetic draft.' },
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', document_id: documentId, revision: 2, source_cv_revision_id: sourceCvTwo, file_id: '11111111-aaaa-4111-8111-111111111111', content_markdown: 'Latest synthetic partial draft.' },
    ]),
  }));

  await page.goto(`/app/projects/${projectId}/documents/${documentId}`);
  await expect(page.getByRole('heading', { name: 'Synthetic partial cover letter' })).toBeVisible();
  await expect(page.getByRole('status')).toBeVisible();

  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByRole('status')).toContainText('Partial document');
  await expect(page.getByTestId('source-cv-revision-1')).toContainText('1');
  await expect(page.getByTestId('source-cv-revision-2')).toContainText('2');
  await expect(page.getByTestId('source-cv-revision-1')).not.toContainText('3');
  await expect(page.getByTestId('source-cv-revision-2')).not.toContainText('3');

  await expect(page.getByTestId('source-cv-revision-1')).toContainText('1');
  await expect(page.getByTestId('source-cv-revision-2')).toContainText('2');
  await expect(page.getByRole('link', { name: 'Open CV profile' })).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Download document' })).toHaveCount(2);
});

test('keeps document access when CV provenance lookup fails or its source is absent', async ({ page }) => {
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/cv`, route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'service_unavailable', message_key: 'service.unavailable', retryable: true }),
  }));
  await page.route(`**/api/v1/projects/${projectId}/documents`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{
      id: documentId,
      document_type: 'cover_letter',
      title: 'Synthetic document with unavailable provenance',
      latest_revision: { id: '22222222-aaaa-4222-8222-222222222222', revision: 2 },
      content_markdown: 'Still available synthetic document.',
      output_language: 'en',
      partial: false,
    }]),
  }));
  await page.route(`**/api/v1/projects/${projectId}/documents/${documentId}/revisions`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: '33333333-aaaa-4333-8333-333333333333', document_id: documentId, revision: 1, source_cv_revision_id: sourceCvOne, file_id: '44444444-aaaa-4444-8444-444444444444' },
      { id: '22222222-aaaa-4222-8222-222222222222', document_id: documentId, revision: 2, source_cv_revision_id: null, file_id: '55555555-aaaa-4555-8555-555555555555' },
    ]),
  }));

  await page.goto(`/app/projects/${projectId}/documents/${documentId}`);
  await page.getByRole('button', { name: 'EN' }).click();
  const unavailableSources = page.getByTestId('source-cv-unavailable');
  await expect(unavailableSources).toHaveCount(2);
  await expect(unavailableSources.first()).toContainText(sourceCvOne);
  await expect(unavailableSources.nth(1)).toContainText('Source CV unavailable');
  await expect(page.getByRole('heading', { name: 'Synthetic document with unavailable provenance' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download document' })).toHaveCount(2);
  await expect(page.getByTestId('document-content')).toContainText('Still available synthetic document.');
});
