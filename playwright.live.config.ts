import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 3109);
const baseURL = `http://127.0.0.1:${port}`;
const isCi = process.env.CI === '1' || process.env.CI === 'true';
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === '1';
const channel = useSystemChrome || !isCi ? 'chrome' : undefined;

export default defineConfig({
  testDir: './test/live',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    channel,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  outputDir: 'test-results/live',
  webServer: {
    command: `node ./test/scripts/serve-static.mjs out ${port}`,
    url: baseURL,
    reuseExistingServer: !isCi,
    timeout: 30_000,
  },
});
