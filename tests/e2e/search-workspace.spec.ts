import { expect, test, type Page } from '@playwright/test';
import { projectId, secondProjectId, useSyntheticApplication } from '../fixtures/application';

const searchItems = [
  { slug: 'bright-data', title: 'Senior Data Analyst', company: 'Bright Data Co.', location: 'Bangkok', cities: ['Bangkok'], work_mode: 'hybrid', skills: ['SQL', 'Python', 'Looker', 'Experimentation'], category: 'data_analytics', posted_at: '2026-10-14T08:00:00Z', age_days: 2, stale: false, source_url: 'https://jobs.example.test/bright-data', description_markdown: 'Own product analytics, experimentation, and reliable reporting for a growing platform team.' },
  { slug: 'northstar', title: 'Analytics Engineer', company: 'Northstar Labs', location: 'Bangkok', cities: ['Bangkok'], work_mode: 'remote', skills: ['dbt', 'SQL', 'BigQuery', 'Python'], category: 'data_analytics', posted_at: '2026-10-13T08:00:00Z', age_days: 3, stale: false, source_url: 'https://jobs.example.test/northstar', description_markdown: 'Build trusted warehouse models and support analytics self-service across the company.' },
  { slug: 'orchid', title: 'Product Data Analyst', company: 'Orchid Systems', location: 'Nonthaburi', cities: ['Nonthaburi'], work_mode: 'onsite', skills: ['SQL', 'Tableau', 'A/B testing'], category: 'data_analytics', posted_at: '2026-10-08T08:00:00Z', age_days: 8, stale: false, source_url: 'https://jobs.example.test/orchid', description_markdown: 'Translate customer behavior into clear product decisions with research and analysis.' },
];

async function installSearchFixture(page: Page, items = searchItems) {
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/job-search**`, route => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/facets')
      ? { total: 124, categories: [{ value: 'data_analytics', count: 38 }, { value: 'software_engineering', count: 31 }], cities: [{ value: 'Bangkok', count: 72 }, { value: 'Chiang Mai', count: 14 }], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 16, thai_postings: 21 }
      : { items, total: 124, limit: 20, offset: Number(url.searchParams.get('offset') ?? 0), pool: 124, hidden_count: 2 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: { email_verified: true, notifications_enabled: true } }) }));
}

test('Search keeps location and work mode in the lead and summarizes active filters', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await installSearchFixture(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/app/projects/${projectId}/search?q=analyst&cities=Bangkok&work_mode=remote&seniority=senior`);
  await expect(page.getByLabel('Location', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Work mode', { exact: true })).toBeVisible();
  const advanced = page.getByRole('button', { name: /More filters/ });
  await expect(advanced).toBeVisible();
  await expect(advanced).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Remove filter: Location: Bangkok' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove filter: Seniority: Senior' })).toBeVisible();
});

test('salary appears only with supplied values, currency and period', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await installSearchFixture(page, [{ ...searchItems[0], salary_min: 60000, salary_max: 80000, salary_currency: 'THB', salary_period: 'month' }]);
  await page.goto(`/app/projects/${projectId}/search`);
  await expect(page.getByText('60,000–80,000 THB/month')).toBeVisible();
  await expect(page.getByText('Salary not listed')).toHaveCount(0);
});

test('mobile result detail has a Back action and restores the search URL', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await installSearchFixture(page);
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/app/projects/${projectId}/search?q=data&work_mode=remote`);
    const result = page.getByRole('button', { name: /Analytics Engineer/ });
    await result.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Back to results' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Analytics Engineer' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to results' }).click();
    await expect(result).toBeVisible();
    await expect(result).toBeFocused();
    await expect(page).toHaveURL(/q=data.*work_mode=remote|work_mode=remote.*q=data/);
  }
});

test('Search exposes loading and empty results with a useful clear action', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  let releaseSearch!: () => void;
  const pendingSearch = new Promise<void>(resolve => { releaseSearch = resolve; });
  await page.route(`**/api/v1/projects/${projectId}/job-search**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/facets')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [], new_7d: 0, thai_postings: 0 }) });
    await pendingSearch;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }) });
  });
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: { email_verified: true, notifications_enabled: true } }) }));
  const navigation = page.goto(`/app/projects/${projectId}/search?q=does-not-exist`);
  await expect(page.getByRole('status')).toBeVisible();
  releaseSearch();
  await navigation;
  await expect(page.getByText('No jobs match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).last().click();
  await expect(page).not.toHaveURL(/q=does-not-exist/);
});

test('source failure can switch to clearly labelled sample results', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/job-search**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/facets')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [] }) });
    return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ code: 'job_source_unavailable', message_key: 'service.unavailable', retryable: true }) });
  });
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: { email_verified: true, notifications_enabled: true } }) }));
  await page.goto(`/app/projects/${projectId}/search`);
  await expect(page.getByRole('heading', { name: "Couldn't load jobs" })).toBeVisible();
  await page.getByRole('button', { name: 'View sample data' }).click();
  await expect(page.getByText('Everything in this view is fictional sample data, not real postings.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to live data' })).toBeVisible();
});

test('a load-more error keeps the successful results visible', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/job-search**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/facets')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 0, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [] }) });
    if (Number(url.searchParams.get('offset') ?? 0) > 0) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ code: 'job_source_unavailable', message_key: 'service.unavailable', retryable: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: searchItems, total: 21, limit: 20, offset: 0 }) });
  });
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: { email_verified: true, notifications_enabled: true } }) }));
  await page.goto(`/app/projects/${projectId}/search`);
  await expect(page.getByRole('button', { name: /Senior Data Analyst/ })).toBeVisible();
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(page.getByRole('alert').filter({ hasText: "Couldn't load jobs" })).toBeVisible();
  await expect(page.getByRole('button', { name: /Senior Data Analyst/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Analytics Engineer/ })).toBeVisible();
});

test('switching projects during a delayed search never shows the earlier project results', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  let projectASearchStarted!: () => void;
  const started = new Promise<void>(resolve => { projectASearchStarted = resolve; });
  const delayedItem = { ...searchItems[0], slug: 'project-a-result', title: 'Project A private result' };
  const nextItem = { ...searchItems[1], slug: 'project-b-result', title: 'Project B result' };
  await page.route(`**/api/v1/projects/${projectId}/job-search**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/facets')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 1, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [] }) });
    projectASearchStarted();
    await new Promise(resolve => setTimeout(resolve, 350));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [delayedItem], total: 1, limit: 20, offset: 0 }) });
  });
  await page.route(`**/api/v1/projects/${secondProjectId}/job-search**`, route => {
    const url = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/facets') ? { total: 1, categories: [], cities: [], seniority: [], employment_type: [], company_type: [], skills: [] } : { items: [nextItem], total: 1, limit: 20, offset: 0 }) });
  });
  await page.route('**/api/v1/projects/**/saved-searches**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: { email_verified: true, notifications_enabled: true } }) }));
  const firstPage = page.goto(`/app/projects/${projectId}/search`);
  await started;
  await page.goto(`/app/projects/${secondProjectId}/search`);
  await expect(page.getByRole('button', { name: /Project B result/ })).toBeVisible();
  await new Promise(resolve => setTimeout(resolve, 450));
  await expect(page.getByText('Project A private result')).toHaveCount(0);
  await firstPage;
});

test('saving a result and starting its evaluation each send one mutation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await installSearchFixture(page);
  let savePosts = 0;
  let sessionPosts = 0;
  await page.route(`**/api/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'cv-data', name: 'Data CV', is_primary: true, created_at: '2026-10-01T00:00:00Z', revision_count: 1, in_use: false, latest_revision: { id: 'cv-rev-1', revision: 3, created_at: '2026-10-14T00:00:00Z', original_filename: 'data.pdf', mime_type: 'application/pdf', size_bytes: 12000, file_id: 'cv-file-1' } }]) }));
  await page.route(`**/api/v1/projects/${projectId}/jobs`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    savePosts += 1;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'saved-search-job', revision: 1, created_at: '2026-10-16T00:00:00Z', title: 'Senior Data Analyst', company: 'Bright Data Co.', source_url: 'https://jobs.example.test/bright-data' }) });
  });
  await page.route(`**/api/v1/projects/${projectId}/sessions`, async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    sessionPosts += 1;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'new-evaluation', project_id: projectId, title: 'Senior Data Analyst', created_at: '2026-10-16T00:00:00Z', cv_revision_id: 'cv-rev-1' }) });
  });
  await page.goto(`/app/projects/${projectId}/search`);
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect.poll(() => savePosts).toBe(1);
  await page.getByRole('button', { name: 'Evaluate this job' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect.poll(() => sessionPosts).toBe(1);
  await expect(page).toHaveURL(new RegExp(`/sessions/new-evaluation$`));
  expect(savePosts).toBe(1);
  expect(sessionPosts).toBe(1);
});

test('Thai and dark mode keep the Search controls readable without horizontal overflow', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ui.locale', 'th');
    localStorage.setItem('ui.theme', 'dark');
  });
  await installSearchFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/projects/${projectId}/search?q=data&work_mode=remote`);
  await expect(page.getByLabel('สถานที่', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ค้นหางาน' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/jsp-ux-search/evidence/search-after-mobile-th-dark.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Smart match labels deterministic coverage and reports a partial AI pool', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  const ai = { status: 'partial', categories: null, scored: 1 };
  const rankedItem = { ...searchItems[0], match: { score_percent: 67, matched: ['SQL', 'Python'], missing: ['Looker'], required_count: 3 }, ai_match: { fit_percent: 72, band: 4, uncertain: true, seniority: 'meets', hard_blocker: false, skills_evidenced: ['SQL'], must_missing: [], nice_missing: ['Looker'] }, highlight: { matched: { SQL: 'SQL' }, missing: {} } };
  await page.route(`**/api/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'cv-data', name: 'Data CV', is_primary: true, created_at: '2026-10-01T00:00:00Z', revision_count: 1, in_use: false, latest_revision: { id: 'cv-rev-1', revision: 3, created_at: '2026-10-14T00:00:00Z', original_filename: 'data.pdf', mime_type: 'application/pdf', size_bytes: 12000, file_id: 'cv-file-1' } }]) }));
  await page.route(`**/api/v1/projects/${projectId}/job-search/match**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [rankedItem, { ...searchItems[1], slug: 'partial-unscored', match: null, ai_match: null }], total: 124, limit: 100, offset: 0, pool: 2, hidden_count: 1, ai }) }));
  await page.route(`**/api/v1/projects/${projectId}/job-search/match/runs`, route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'rank-run-1' }) }));
  await page.route(`**/api/v1/projects/${projectId}/runs/rank-run-1`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'rank-run-1', status: 'completed' }) }));
  let hiddenDeletes = 0;
  await page.route(`**/api/v1/projects/${projectId}/job-search/hidden**`, route => {
    if (route.request().method() === 'DELETE') { hiddenDeletes += 1; return route.fulfill({ status: 204, body: '' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'hidden-1', kind: 'job', label: 'Previously hidden analyst role', created_at: '2026-10-01T00:00:00Z' }] }) });
  });
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: { email_verified: true, notifications_enabled: true } }) }));
  await page.goto(`/app/projects/${projectId}/search?mode=match`);
  await expect(page.getByRole('status').filter({ hasText: 'Ranking with AI' })).toBeVisible();
  await expect(page.getByText('Keyword ranking is shown while AI ranking is pending or unavailable.')).toBeVisible();
  await expect(page.getByText('Rank jobs against your CV (uses AI).')).toBeVisible();
  await expect(page.getByText('Changing the CV affects new estimates only.')).toBeVisible();
  await expect(page.getByText('AI ranked 1 of 2 jobs in this result pool')).toBeVisible({ timeout: 6000 });
  await expect(page.getByText('Only the first 2 matching jobs are in the Smart match pool; 124 match your filters.')).toBeVisible();
  const evidence = page.getByRole('region', { name: 'Match evidence' });
  await expect(evidence.getByText('AI fit (1–5)', { exact: true })).toBeVisible();
  await expect(evidence.getByText('4 / 5 · Good fit')).toBeVisible();
  await expect(evidence.getByText('2 of 3 skills found')).toBeVisible();
  await expect(page.getByText('%', { exact: false }).filter({ hasText: /72%/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Evaluate with Data CV · v3' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View details' })).toHaveCount(0);
  await expect(page.getByText('AI estimate is uncertain')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hidden (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Hidden (1)' }).click();
  await expect(page.getByText('Previously hidden analyst role')).toBeVisible();
  await page.getByRole('button', { name: 'Unhide' }).click();
  await expect.poll(() => hiddenDeletes).toBe(1);
});

test('Smart match without a usable CV explains the prerequisite', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await installSearchFixture(page);
  await page.goto(`/app/projects/${projectId}/search?mode=match`);
  await expect(page.getByText('This project has no CV yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the CV page' })).toHaveAttribute('href', `/app/projects/${projectId}/profile`);
});

test('Smart match keeps its CV profiling state visible while processing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui.locale', 'en'));
  await useSyntheticApplication(page);
  await page.route(`**/api/v1/projects/${projectId}/cvs`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'cv-data', name: 'Data CV', is_primary: true, created_at: '2026-10-01T00:00:00Z', revision_count: 1, in_use: false, latest_revision: { id: 'cv-rev-1', revision: 3, created_at: '2026-10-14T00:00:00Z', original_filename: 'data.pdf', mime_type: 'application/pdf', size_bytes: 12000, file_id: 'cv-file-1' } }]) }));
  await page.route(`**/api/v1/projects/${projectId}/job-search/match**`, route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'cv_profile_missing', message_key: 'cv.profile_missing', retryable: true }) }));
  await page.route(`**/api/v1/projects/${projectId}/cvs/cv-data/profile`, route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'profile-run', status: 'running' }) }));
  await page.route(`**/api/v1/projects/${projectId}/runs/profile-run`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'profile-run', status: 'running' }) }));
  await page.route(`**/api/v1/projects/${projectId}/saved-searches**`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], status: { email_verified: true, notifications_enabled: true } }) }));
  await page.goto(`/app/projects/${projectId}/search?mode=match`);
  await expect(page.getByRole('status').filter({ hasText: 'Analyzing your CV' })).toBeVisible();
});

test('capture Search workspace font-loaded evidence matrix', async ({ page }) => {
  const variants = [
    { device: 'desktop', width: 1440, height: 1000 },
    { device: 'tablet', width: 820, height: 1000 },
    { device: 'mobile', width: 390, height: 844 },
  ] as const;
  for (const locale of ['en', 'th'] as const) for (const theme of ['light', 'dark'] as const) for (const variant of variants) {
    const capturePage = await page.context().newPage();
    const fontFailures: string[] = [];
    capturePage.on('requestfailed', request => {
      if (/\.(woff2?|ttf|otf)(?:\?|$)/i.test(request.url())) fontFailures.push(request.url());
    });
    capturePage.on('response', response => {
      if (/\.(woff2?|ttf|otf)(?:\?|$)/i.test(response.url()) && response.status() >= 400) fontFailures.push(`${response.status()} ${response.url()}`);
    });
    try {
      await capturePage.addInitScript(({ locale, theme }) => {
        localStorage.setItem('ui.locale', locale);
        localStorage.setItem('ui.theme', theme);
      }, { locale, theme });
      await installSearchFixture(capturePage);
      await capturePage.setViewportSize({ width: variant.width, height: variant.height });
      await capturePage.goto(`/app/projects/${projectId}/search?q=data&work_mode=remote`);
      await expect(capturePage.getByRole('heading', { name: locale === 'th' ? 'ค้นหางาน' : 'Job search' })).toBeVisible();
      const fonts = await capturePage.evaluate(async () => {
        const requests: Array<[string, string]> = [
          ['400 16px "Noto Sans Thai"', 'ภาษาไทย'],
          ['500 16px "Noto Sans Thai"', 'ภาษาไทย'],
          ['600 16px "Noto Sans Thai"', 'ภาษาไทย'],
          ['400 16px Manrope', 'Search'],
        ];
        for (const [font, sample] of requests) await document.fonts.load(font, sample);
        await document.fonts.ready;
        return {
          checks: requests.map(([font, sample]) => ({ font, loaded: document.fonts.check(font, sample) })),
          resources: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /\.(woff2?|ttf|otf)(?:\?|$)/i.test(name)),
        };
      });
      expect(fonts.checks.every(item => item.loaded), JSON.stringify(fonts, null, 2)).toBe(true);
      expect(fonts.resources.length, JSON.stringify(fonts, null, 2)).toBeGreaterThanOrEqual(4);
      expect(fontFailures, `Font request failures: ${fontFailures.join(', ')}`).toEqual([]);
      await capturePage.screenshot({
        path: `/tmp/jsp-ux-search/evidence/search-after-fontloaded-${variant.device}-${locale}-${theme}.png`,
        fullPage: true,
      });
    } finally {
      await capturePage.close();
    }
  }
});
