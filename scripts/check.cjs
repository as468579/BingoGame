'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(file) : /\.(js|cjs)$/.test(entry.name) ? [file] : [];
  });
}

const files = ['server.js', 'public/client.js', ...['src', 'public/js', 'test', 'scripts'].flatMap(directory => collect(path.join(root, directory)))];
for (const file of files) {
  const absolute = path.resolve(root, file);
  const browserModule = absolute.startsWith(path.join(root, 'public') + path.sep);
  const args = browserModule ? ['--input-type=module', '--check'] : ['--check', absolute];
  const result = spawnSync(process.execPath, args, {
    input: browserModule ? fs.readFileSync(absolute) : undefined, encoding: 'utf8'
  });
  if (result.status !== 0) {
    console.error(`Syntax check failed: ${path.relative(root, absolute)}\n${result.stderr || result.error}`);
    process.exit(1);
  }
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
