import { runCommand } from './run-command.mjs';

async function main() {
  const ciEnvironment = {
    CI: '1',
    PLAYWRIGHT_USE_SYSTEM_CHROME: process.env.GITHUB_ACTIONS ? '0' : '1',
  };

  await runCommand('npm', ['run', 'lint'], { env: ciEnvironment });
  await runCommand('npm', ['run', 'typecheck'], { env: ciEnvironment });
  await runCommand('npm', ['run', 'build'], { env: ciEnvironment });
  await runCommand('npm', ['run', 'test:unit'], { env: ciEnvironment });
  await runCommand('npm', ['run', 'test:e2e'], { env: ciEnvironment });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
