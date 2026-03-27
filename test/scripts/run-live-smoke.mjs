import { runCommand } from './run-command.mjs';

async function main() {
  await runCommand('npm', ['run', 'build'], { env: { CI: process.env.CI || '0' } });
  await runCommand('npx', ['playwright', 'test', '-c', 'playwright.live.config.ts'], {
    env: {
      CI: process.env.CI || '0',
      ENABLE_NETWORK_LIVE_SMOKE: process.env.ENABLE_NETWORK_LIVE_SMOKE || '',
      LIVE_MANIFEST_URL: process.env.LIVE_MANIFEST_URL || '',
    },
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
