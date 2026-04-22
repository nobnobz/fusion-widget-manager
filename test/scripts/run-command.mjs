import { spawn } from 'node:child_process';

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ...options.env,
    };

    if ('FORCE_COLOR' in env && 'NO_COLOR' in env) {
      delete env.NO_COLOR;
    }

    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env,
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited via signal ${signal}.`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}.`));
        return;
      }

      resolve();
    });
  });
}
