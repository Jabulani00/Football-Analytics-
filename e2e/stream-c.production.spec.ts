import { expect, test, type Page } from '@playwright/test';

const HUNT_URL = 'https://zymspnykcnqczqdnernb.supabase.co/functions/v1/hollywood-hunt';
const BETWAY_HUNT_URL = '/betway-hunt-status';
const SLIP_KEY = 'scoreline.analytics-bet-slip.v1';

async function openAnalytics(page: Page) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto('/analytics', { waitUntil: 'commit', timeout: 30_000 });
      await expect(page.getByText('BETTING INTELLIGENCE', { exact: true })).toBeVisible({ timeout: 20_000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await page.waitForTimeout(1_000);
    }
  }
  throw lastError;
}

async function openTab(page: Page, name: string) {
  const section = page.getByRole('button', { name: /^Section: / });
  await expect(section).toBeVisible();
  await section.click();
  const option = page.getByRole('button', { name: `Section option: ${name}`, exact: true });
  await expect(option).toBeVisible();
  await option.click();
}

test.describe('Stream C production acceptance', () => {
  test('deployment, navigation and frontend secret boundary', async ({ page, request }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await openAnalytics(page);
    for (const tab of [
      'Overview',
      'Stats Tables',
      'Predictions',
      '🔎 Bet Finder',
      'Streams',
      'Strategies',
      'Odds Fusion',
      'Hollywoodbets',
      'Betway',
      'Bet Slip',
    ]) {
      await openTab(page, tab);
    }

    await expect(page.getByText('Generated Bet Slip', { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);

    const scripts = await page.locator('script[src]').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).src),
    );
    const entry = scripts.find((src) => src.includes('/_expo/static/js/web/entry-'));
    expect(entry).toBeTruthy();
    const response = await request.get(entry as string);
    expect(response.ok()).toBeTruthy();
    const bundle = await response.text();
    expect(bundle).toContain('zymspnykcnqczqdnernb.supabase.co');
    expect(bundle).toContain('sb_publishable_');
    expect(bundle).toContain('Hollywood Hunt public endpoint');
    expect(bundle).not.toContain('sb_secret_');
  });

  test('public Hunt read works while crawler writes remain protected', async ({ request }) => {
    const get = await request.get(HUNT_URL);
    expect(get.status()).toBe(200);
    expect(get.headers()['access-control-allow-origin']).toBe('*');
    const snapshot = await get.json();
    for (const key of ['changes', 'crawlState', 'currentEvents', 'removedEvents']) {
      expect(Array.isArray(snapshot[key]), `${key} must be an array`).toBeTruthy();
    }
    expect(snapshot.currentEvents.length).toBeGreaterThan(0);
    expect(snapshot.crawlState.length).toBeGreaterThan(0);

    const options = await request.fetch(HUNT_URL, { method: 'OPTIONS' });
    expect(options.status()).toBe(204);
    expect(options.headers()['access-control-allow-methods']).toContain('GET');

    const rejectedPost = await request.post(HUNT_URL, { data: {} });
    expect(rejectedPost.status()).toBe(401);
  });

  test('Hollywood Hunt shows crawler health and live navigation controls', async ({ page }, testInfo) => {
    await openAnalytics(page);
    await openTab(page, 'Hollywoodbets');
    await expect(page.getByText('HOLLYWOOD HUNT', { exact: true })).toBeVisible();
    await expect(page.getByText('Reading crawler status…', { exact: true })).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText(/change signals? in the last hour|Database connected, but no crawler run/)).toBeVisible();
    await expect(page.getByText(/Database not connected/)).toHaveCount(0);
    for (const metric of ['CURRENT', 'REMOVED', 'COVERAGE', 'CRAWL ISSUES']) {
      await expect(page.getByText(metric, { exact: true })).toBeVisible();
    }
    const country = page.getByRole('button', { name: /^Country: / });
    await expect(country).toBeVisible();
    await country.click();
    await expect(page.getByPlaceholder('Search…')).toBeVisible();

    const southAfrica = page.getByRole('button', { name: 'Country option: South Africa', exact: true });
    if (await southAfrica.count()) {
      await southAfrica.click();
      await expect(page.getByText('League', { exact: true })).toBeVisible();
    } else {
      testInfo.annotations.push({
        type: 'data-dependent',
        description: 'South Africa was not present in the current Hollywood country response.',
      });
    }
  });

  test('Odds Fusion exposes evidence, edge and bookmaker comparison state', async ({ page }, testInfo) => {
    await openAnalytics(page);
    await openTab(page, 'Odds Fusion');
    await expect(page.getByText('Odds Fusion — Live Matches', { exact: true })).toBeVisible();
    await expect(page.getByText('LOADING…', { exact: true })).toBeHidden({ timeout: 30_000 });
    for (const heading of ['Fixture', 'Book', 'Market', 'Odds', 'Edge']) {
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Same-fixture Bookmaker Comparison', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/NaN|Infinity/);

    const state = await page.getByText(/^(LIVE|SAMPLE)$/).first().textContent();
    if (state === 'SAMPLE') {
      testInfo.annotations.push({
        type: 'data-dependent',
        description: 'Live providers returned no usable rows; the explicit SAMPLE fallback was verified.',
      });
    }
    const noComparison = page.getByText(/No extra-bookmaker|Extra-bookmaker feed is live/);
    if (await noComparison.count()) {
      testInfo.annotations.push({
        type: 'data-dependent',
        description: (await noComparison.first().textContent()) ?? 'No current bookmaker match.',
      });
    }
  });

  test('strategy validation and same-browser persistence work', async ({ page }) => {
    await openAnalytics(page);
    await openTab(page, 'Strategies');
    const name = page.getByPlaceholder('Strategy name');
    await name.fill('');
    await page.getByText('SAVE STRATEGY', { exact: true }).click();
    await expect(page.getByText(/Enter a name, choose at least one layer/)).toBeVisible();

    await name.fill('QA value strategy');
    await page.getByText('SAVE STRATEGY', { exact: true }).click();
    await expect(page.getByText('Strategy saved on this device and added to live evaluation.')).toBeVisible();
    await expect(page.getByText('QA value strategy', { exact: true })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openTab(page, 'Strategies');
    await expect(page.getByText('QA value strategy', { exact: true })).toBeVisible();
    await page.getByText('REMOVE', { exact: true }).click();
    await expect(page.getByText('QA value strategy', { exact: true })).toHaveCount(0);
  });

  test('shared Bet Slip persists and calculates accumulator and singles correctly', async ({ page }) => {
    await page.addInitScript(
      ({ key, legs }) => window.localStorage.setItem(key, JSON.stringify(legs)),
      {
        key: SLIP_KEY,
        legs: [
          { id: 'qa-1', fixture: 'QA Home vs QA Away', market: '1X2', selection: 'Home', odds: 1.5, bookmaker: 'Hollywoodbets' },
          { id: 'qa-2', fixture: 'Test United vs Test City', market: 'BTTS', selection: 'Yes', odds: 2, bookmaker: 'OddAlerts' },
        ],
      },
    );
    await openAnalytics(page);
    await openTab(page, 'Bet Slip');
    await expect(page.getByText('QA Home vs QA Away', { exact: true })).toBeVisible();
    await expect(page.getByText('Test United vs Test City', { exact: true })).toBeVisible();
    await expect(page.getByText('3.00', { exact: true })).toBeVisible();
    await expect(page.getByText('R 50.00', { exact: true })).toBeVisible();
    await expect(page.getByText('R 150.00', { exact: true })).toBeVisible();

    await page.getByText('SINGLES', { exact: true }).click();
    await expect(page.getByText('R 100.00', { exact: true })).toBeVisible();
    await expect(page.getByText('R 175.00', { exact: true })).toBeVisible();
    await expect(page.getByText('EXPORT TO HOLLYWOODBETS', { exact: true }).locator('..')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(/Switch to Accumulator/)).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openTab(page, 'Bet Slip');
    await expect(page.getByText('QA Home vs QA Away', { exact: true })).toBeVisible();
    await page.getByText('CLEAR SLIP', { exact: true }).click();
    await expect(page.getByText('Add selections from Strategies or Odds Fusion.')).toBeVisible();
  });

  test('Hollywood proxy is reachable from the production origin', async ({ request }) => {
    const response = await request.get(
      '/hollywood?host=events&path=api%2Fevents%2Feps%2Fsports%2F1%2Fcategories',
    );
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload) || typeof payload === 'object').toBeTruthy();
  });

  test('Betway public hunt status is readable and visible in Analytics', async ({ page, request }) => {
    const response = await request.get(BETWAY_HUNT_URL);
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.bookmaker).toBe('Betway');
    expect(typeof payload.historyAvailable).toBe('boolean');
    expect(Array.isArray(payload.currentEvents)).toBeTruthy();
    expect(Array.isArray(payload.verifiedRemovals)).toBeTruthy();
    expect(Array.isArray(payload.pendingRemovals)).toBeTruthy();
    expect(Array.isArray(payload.classifiedEvents)).toBeTruthy();
    expect(payload.currentEvents.some((event: { markets?: unknown[] }) =>
      Array.isArray(event.markets) && event.markets.length > 1
    )).toBeTruthy();

    await openAnalytics(page);
    await openTab(page, 'Betway');
    await expect(page.getByText('BETWAY HUNT', { exact: true })).toBeVisible();
    await expect(page.getByText('CURRENT BETWAY MARKETS', { exact: true })).toBeVisible();
    const moreMarkets = page.getByText('▸ More Betway markets', { exact: true }).first();
    await expect(moreMarkets).toBeVisible();
    await moreMarkets.click();
    await expect(page.getByText(/^▾ Hide markets/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Betway market group: Popular', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Betway market group: Goals', exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Total Goals|BTTS \(GG\/NG\)|Draw No Bet|1X2/, { exact: true }).first()).toBeVisible();
  });

  test('mobile viewport keeps core Stream C controls reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAnalytics(page);
    for (const tab of ['Strategies', 'Odds Fusion', 'Hollywoodbets', 'Betway', 'Bet Slip']) {
      await openTab(page, tab);
    }
    await expect(page.getByText('Generated Bet Slip', { exact: true })).toBeVisible();
  });
});
