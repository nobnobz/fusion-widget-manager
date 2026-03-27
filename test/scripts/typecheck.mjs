import { existsSync } from 'node:fs';
import { runCommand } from './run-command.mjs';

const generatedTypeDirs = ['.next/types', '.next/dev/types'];

async function ensureNextTypes() {
  if (generatedTypeDirs.some((directory) => existsSync(directory))) {
    return;
  }

  await runCommand('npx', ['--no-install', 'next', 'typegen']);
}

async function main() {
  await ensureNextTypes();
  await runCommand('npx', ['--no-install', 'tsc', '--noEmit']);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
