#!/usr/bin/env node
/**
 * Serves a web build the way Vercel does (docs/e2e/manual/README.md), for manual testing only.
 *   node scripts/e2e/serve-dist.mjs [dir=~/.wapee-e2e/web-dist] [port=8090]
 * - filesystem first with cleanUrls (`/login` -> login.html, `/x/` -> x/index.html)
 * - every other path -> `/_app/shell.html` (the `rewrites` rule); `[slug].html` templates never match literally
 * - the `headers` rules from vercel.json, so security-header checks see the same values
 * Listens on all interfaces so a phone on the same Wi-Fi can open it.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? join(homedir(), '.wapee-e2e', 'web-dist'));
const port = Number(process.argv[3] ?? 8090);
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

// Vercel `source` patterns: `:name` = one segment, the rest is a regex anchored on the whole path.
const toRegex = (source) => new RegExp(`^${source.replace(/\/:\w+/g, '/[^/]+')}$`);
const headerRules = vercel.headers.map((rule) => ({ re: toRegex(rule.source), headers: rule.headers }));

const isFile = (p) => existsSync(p) && statSync(p).isFile();

function resolveFile(path) {
  const base = normalize(join(root, path));
  if (!base.startsWith(root)) return null;
  const file = [base, `${base}.html`, join(base, 'index.html')].find(isFile);
  if (!file || /\[.+\]/.test(file.slice(root.length))) return join(root, '_app/shell.html');
  return file;
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = resolveFile(path);
  if (!file) {
    res.writeHead(400).end();
    return;
  }
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  // Later rules win, as on Vercel.
  for (const rule of headerRules) {
    if (rule.re.test(path)) for (const h of rule.headers) headers[h.key] = h.value;
  }
  res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : readFileSync(file));
}).listen(port, '0.0.0.0', () => process.stdout.write(`serving ${root} on http://localhost:${port}\n`));
