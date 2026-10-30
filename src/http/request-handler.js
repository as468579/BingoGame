'use strict';

const { fail } = require('../domain/errors');
const { serveStatic } = require('./static-assets');

async function readAction(request) {
  if (request.headers.origin && ![`http://${request.headers.host}`, `https://${request.headers.host}`].includes(request.headers.origin)) {
    fail('來源不被允許。', 403);
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 16384) fail('請求內容過大。', 413);
  }
  let data;
  try { data = JSON.parse(raw); } catch { fail('無效的 JSON。'); }
  if (!data || typeof data !== 'object') fail('無效的操作。');
  return data;
}

function createRequestHandler(service, connections, publicDirectory) {
  return async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/events') {
        const { room, player } = service.authenticate(url.searchParams.get('code'), url.searchParams.get('token'));
        response.writeHead(200, {
          'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
        });
        response.write('retry: 1500\n\n');
        const unsubscribe = connections.subscribe(player.id, response);
        service.connected(room, player);
        request.once('close', () => { unsubscribe(); service.broadcast(room); });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/action') {
        const result = service.execute(await readAction(request));
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(result));
        return;
      }
      serveStatic(request, response, url.pathname, publicDirectory);
    } catch (error) {
      if (response.headersSent) return response.end();
      response.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error.status ? error.message : '伺服器發生錯誤，請稍後重試。' }));
      if (!error.status) console.error(error);
    }
  };
}

module.exports = { createRequestHandler };
