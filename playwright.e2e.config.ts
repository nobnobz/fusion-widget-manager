import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 3107);
const baseURL = `http://127.0.0.1:${port}`;
const isCi = process.env.CI === '1' || process.env.CI === 'true';
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === '1';
const channel = useSystemChrome || !isCi ? 'chrome' : undefined;
const webServerCommand = isCi
  ? `node ./test/scripts/serve-static.mjs out ${port}`
  : `rm -f .next/dev/lock && npm run dev -- --webpack --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel,
        viewport: { width: 1440, height: 1080 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        channel,
      },
    },
  ],
  outputDir: 'test-results/e2e',
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !isCi,
    timeout: isCi ? 180_000 : 120_000,
  },
});
