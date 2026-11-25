'use strict';
const {createServer} = require('node:http');
const {readFile} = require('node:fs/promises');
const {join, extname} = require('node:path');

const media = join(__dirname, '..', 'media');
const typeByExtension = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
};

// Serve only the same webview assets that the extension supplies, on loopback.
async function serveWebview({assets, onAsset} = {}) {
  const html = (await readFile(join(media, 'index.html'), 'utf8'))
    .replaceAll('__CSS__', '/style.css')
    .replaceAll('__APP__', '/editor.js')
    .replaceAll('__WORKER__', '/mesh.js')
    .replaceAll('__CSP__', "'self'")
    .replaceAll('__ASSETS__', assets ? '/assets' : '');

  const server = createServer(async (request, response) => {
    const relative = (request.url || '').slice(1);
    if (!relative) {
      response.setHeader('Content-Type', 'text/html');
      response.end(html);
      return;
    }
    const isAsset = Boolean(assets && /^assets\/[a-z0-9_.-]+\/(blockstates|models|textures|items|painting_variant)\/[a-z0-9_./-]+\.(json|png)$/.test(relative) && !relative.split('/').some(segment => !segment || segment === '.' || segment === '..'));
    const isMedia = /^[a-z0-9_-]+\.(js|css|json)$/.test(relative);
    const contents = isAsset || isMedia
      ? await readFile(isAsset ? join(assets, relative.slice(7)) : join(media, relative)).catch(() => null)
      : null;
    if (!contents) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    if (isAsset) onAsset?.(relative);
    response.setHeader('Content-Type', typeByExtension[extname(relative)]);
    response.end(contents);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function launchBrowser() {
  const {chromium} = require(process.env.BROWSER_PLAYWRIGHT || 'playwright');
  return chromium.launch({
    executablePath: process.env.BROWSER_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
}

module.exports = {serveWebview, launchBrowser};
