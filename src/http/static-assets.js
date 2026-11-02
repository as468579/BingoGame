'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fail } = require('../domain/errors');

const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

function serveStatic(request, response, pathname, publicDirectory) {
  try { pathname = decodeURIComponent(pathname); } catch { fail('找不到頁面。', 404); }
  const entry = ['/', '/join', '/join/', '/bridge-bingo', '/bridge-bingo/'].includes(pathname) ? 'index.html' : pathname.slice(1);
  // Only public source assets are served. Data, credentials, dotfiles, and traversal stay inaccessible.
  if (request.method !== 'GET' || (!/^(?:[a-zA-Z0-9_/-]+\.(?:js|css)|[\p{L}\p{N}_/-]+\.png)$/u.test(entry) && entry !== 'index.html')) {
    fail('找不到頁面。', 404);
  }
  const file = path.resolve(publicDirectory, entry);
  if (!file.startsWith(path.resolve(publicDirectory) + path.sep) || !fs.existsSync(file)) fail('找不到頁面。', 404);
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(file)], 'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
  });
  response.end(fs.readFileSync(file));
}

module.exports = { serveStatic };
