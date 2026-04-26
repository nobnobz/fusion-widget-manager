import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 3108);
const baseURL = `http://127.0.0.1:${port}`;
const isCi = process.env.CI === '1' || process.env.CI === 'true';
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === '1';
const channel = useSystemChrome || !isCi ? 'chrome' : undefined;

export default defineConfig({
  testDir: './test/perf',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    channel,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  outputDir: 'test-results/perf',
  webServer: {
    command: `rm -f .next/dev/lock && npm run dev -- --webpack --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
