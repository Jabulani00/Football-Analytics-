import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'https://football-analytics-rose.vercel.app';

export default defineConfig({
  testDir: './e2e',
  outputDir: 'e2e-results/artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['line'],
    ['./e2e/compactReporter.ts'],
    ['html', { outputFolder: 'e2e-results/html', open: 'never' }],
  ],
  use: {
    ...devices['Desktop Edge'],
    baseURL,
    channel: 'msedge',
    headless: true,
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
});
