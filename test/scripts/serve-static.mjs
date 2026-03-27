import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';

const rootDirectory = resolve(process.cwd(), process.argv[2] || 'out');
const port = Number(process.argv[3] || 3109);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function sendFile(response, filePath) {
  const extension = extname(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
}

if (!existsSync(rootDirectory) || !statSync(rootDirectory).isDirectory()) {
  console.error(`Static export directory not found: ${rootDirectory}`);
  process.exit(1);
}

const server = createServer((request, response) => {
  const requestPath = normalize((request.url || '/').split('?')[0]).replace(/^(\.\.[/\\])+/, '');
  const candidatePath = resolve(rootDirectory, `.${requestPath}`);
  const fallbackPath = resolve(rootDirectory, 'index.html');

  if (!candidatePath.startsWith(rootDirectory)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  let filePath = candidatePath;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!existsSync(filePath)) {
    filePath = fallbackPath;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404).end('Not found');
    return;
  }

  sendFile(response, filePath);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${rootDirectory} on http://127.0.0.1:${port}`);
});
