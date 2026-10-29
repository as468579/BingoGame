'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const savePath = path.join(DATA, 'rooms.json');
let rooms = fs.existsSync(savePath) ? JSON.parse(fs.readFileSync(savePath, 'utf8')) : {};
const streams = new Map();
const online = id => Boolean(streams.get(id)?.size);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const persist = () => {
  fs.writeFileSync(savePath + '.tmp', JSON.stringify(rooms));
  fs.renameSync(savePath + '.tmp', savePath);
};
function lines(board, called, size = Math.sqrt(board.length)) {
  const marked = new Set(called);
  const sets = [];
  for (let i = 0; i < size; i++) {
    sets.push(board.slice(i * size, i * size + size));
    sets.push(Array.from({ length: size }, (_, j) => board[j * size + i]));
  }
  sets.push(Array.from({ length: size }, (_, i) => board[i * size + i]),
    Array.from({ length: size }, (_, i) => board[i * size + size - 1 - i]));
  return sets.filter(set => set.every(n => marked.has(n))).length;
}
function initialGameState(room) {
  return { phase: 'playing', turn: room.players[0].id, called: [], winners: [], pending: null, lastDecision: null };
}
function canUndo(room) {
  if (room.history?.length) return true;
  return ['playing', 'finished'].includes(room.phase) && (room.phase === 'finished' || room.called.length > 0 ||
    Boolean(room.pending) || Boolean(room.lastDecision) || room.winners.length > 0 || room.turn !== room.players[0].id);
}
function view(room) {
  return {
    code: room.code, phase: room.phase, host: room.host, turn: room.turn,
    size: room.size || 5, goal: room.size || 5, boardVersion: room.boardVersion || 0,
    called: room.called, winners: room.winners, revision: room.revision,
    pending: room.pending || null, lastDecision: room.lastDecision || null,
    canUndo: canUndo(room),
    players: room.players.map(p => ({ id: p.id, name: p.name, board: p.board,
      ready: p.ready, online: online(p.id), lines: lines(p.board, room.called) }))
  };
}
function broadcast(room) {
  const data = `data: ${JSON.stringify(view(room))}\n\n`;
  for (const p of room.players) for (const response of streams.get(p.id) || []) response.write(data);
}
function auth(code, token) {
  const room = rooms[code];
  if (!room) fail('找不到房間，請確認房號。', 404);
  const player = room.players.find(p => p.token === token);
  if (!player) fail('此瀏覽器尚未加入這個房間。', 401);
  return { room, player };
}
function boardValid(board, size) {
  const count = size * size;
  return Array.isArray(board) && board.length === count && new Set(board).size === count && board.every(n => Number.isInteger(n) && n >= 1 && n <= count);
}
function action(data) {
  const { kind, token, requestId } = data;
  if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/i.test(token)) fail('無效的玩家憑證。');
  if (typeof requestId !== 'string' || requestId.length > 80 || !requestId) fail('缺少操作識別碼。');
  if (kind === 'create' || kind === 'join') {
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name || name.length > 20) fail('請輸入 1～20 個字的玩家 ID。');
    let room;
    if (kind === 'create') {
      room = Object.values(rooms).find(r => r.createRequest === requestId && r.players.some(p => p.token === token));
      if (!room) {
        if (Object.keys(rooms).length >= 1000) fail('房間已達上限。', 503);
        let code;
        do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms[code]);
        room = { code, createRequest: requestId, phase: 'lobby', players: [], host: null,
          called: [], turn: null, winners: [], pending: null, lastDecision: null, history: [], size: 5, boardVersion: 0, revision: 0 };
        rooms[code] = room;
      }
    } else room = rooms[String(data.code).toUpperCase()];
    if (!room) fail('找不到房間，請確認房號。', 404);
    // The user-chosen ID is room-scoped; it also restores players on another browser/device.
    let player = room.players.find(p => p.name === name);
    if (!player) {
      if (room.phase !== 'lobby') fail('遊戲已開始，暫時無法加入新玩家。');
      if (room.players.length >= 16) fail('房間最多可容納 16 位玩家。');
      const playerToken = room.players.some(p => p.token === token) ? crypto.randomUUID() : token;
      player = { id: crypto.randomUUID(), token: playerToken, name, board: Array.from({ length: (room.size || 5) ** 2 }, (_, i) => i + 1), ready: false, requests: [] };
      room.players.push(player);
      room.host ||= player.id;
      room.revision++;
    }
    persist(); broadcast(room);
    return { room: view(room), playerId: player.id, token: player.token };
  }
  const { room, player } = auth(String(data.code).toUpperCase(), token);
  const size = room.size || 5;
  if (player.requests.includes(requestId)) return { room: view(room), playerId: player.id };
  const reversible = ['call', 'approve', 'reject', 'skip'].includes(kind);
  const previous = reversible ? structuredClone({ phase: room.phase, turn: room.turn, called: room.called,
    winners: room.winners, pending: room.pending || null, lastDecision: room.lastDecision || null }) : null;
  if (kind === 'settings') {
    if (room.host !== player.id) fail('只有房主可以設定盤面尺寸。', 403);
    if (room.phase !== 'lobby') fail('請先重新開局，再修改盤面尺寸。');
    if (!Number.isInteger(data.size) || data.size < 3 || data.size > 9) fail('盤面尺寸請選擇 3～9。');
    if (data.size !== size) {
      room.size = data.size; room.boardVersion = (room.boardVersion || 0) + 1;
      room.players.forEach(p => { p.board = Array.from({ length: data.size ** 2 }, (_, i) => i + 1); p.ready = false; });
      room.history = []; room.called = []; room.winners = []; room.pending = null; room.lastDecision = null; room.turn = null;
    }
  } else if (kind === 'board') {
    if (room.phase !== 'lobby') fail('遊戲開始後無法修改盤面。');
    if ((data.boardVersion || 0) !== (room.boardVersion || 0)) fail('盤面尺寸已更新，請重新排列並準備。', 409);
    if (!boardValid(data.board, size)) fail(`請填入 1～${size * size}，每個數字只能出現一次。`);
    player.board = data.board; player.ready = Boolean(data.ready);
  } else if (kind === 'start') {
    if (room.host !== player.id) fail('只有房主可以開始遊戲。', 403);
    if (room.phase !== 'lobby') fail('遊戲已經開始。');
    if (room.players.length < 2 || !room.players.every(p => p.ready)) fail('至少需要 2 位玩家，且所有玩家都必須準備完成。');
    room.phase = 'playing'; room.turn = room.players[0].id;
  } else if (kind === 'call') {
    if (room.phase !== 'playing') fail('目前不是選號階段。');
    if (room.pending) fail('請先等待房主處理目前的選號。');
    if (room.turn !== player.id) fail('請等待輪到你選號。');
    if (!Number.isInteger(data.number) || data.number < 1 || data.number > size * size) fail(`號碼必須為 1～${size * size}。`);
    if (room.called.includes(data.number)) fail('這個號碼已經選過。');
    room.pending = { id: crypto.randomUUID(), playerId: player.id, number: data.number };
  } else if (kind === 'approve' || kind === 'reject') {
    if (room.host !== player.id) fail('只有房主可以確認或拒絕選號。', 403);
    if (room.phase !== 'playing' || !room.pending) fail('目前沒有待確認的號碼。');
    if (data.pendingId !== room.pending.id) fail('此選號已處理，請以最新畫面為準。', 409);
    room.lastDecision = { ...room.pending, approved: kind === 'approve' };
    if (kind === 'approve') room.called.push(room.pending.number);
    room.pending = null;
    room.winners = room.players.filter(p => lines(p.board, room.called) >= size).map(p => p.id);
    if (room.winners.length || room.called.length === size * size) { room.phase = 'finished'; room.turn = null; }
    else room.turn = room.players[(room.players.findIndex(p => p.id === room.turn) + 1) % room.players.length].id;
  } else if (kind === 'skip') {
    if (room.host !== player.id || room.phase !== 'playing') fail('只有房主可以略過離線玩家。', 403);
    if (room.pending) fail('請先確認或拒絕待處理的號碼。');
    if (online(room.turn)) fail('目前選號玩家仍在線上。');
    room.turn = room.players[(room.players.findIndex(p => p.id === room.turn) + 1) % room.players.length].id;
  } else if (kind === 'undo') {
    if (room.host !== player.id) fail('只有房主可以回到上一步。', 403);
    if (data.revision !== room.revision) fail('遊戲進度已更新，請查看最新狀態後再按上一步。', 409);
    if (!canUndo(room)) fail('已經回到本局剛開始，沒有更早的步驟。');
    // Older saves may predate history tracking. Preserve exact recorded steps, then fall back to the opening state.
    Object.assign(room, room.history?.length ? room.history.pop() : initialGameState(room));
    // A restored selection gets a new identity so late decisions from older tabs cannot approve it.
    if (room.pending) room.pending.id = crypto.randomUUID();
  } else if (kind === 'reset') {
    if (room.host !== player.id) fail('只有房主可以開新局。', 403);
    room.phase = 'lobby'; room.called = []; room.turn = null; room.winners = []; room.pending = null; room.lastDecision = null;
    room.history = [];
    room.players.forEach(p => { p.ready = false; });
  } else fail('不支援的操作。');
  if (reversible) { room.history ||= []; room.history.push(previous); }
  player.requests.push(requestId);
  // Retain successful operation IDs for the full room lifetime, including new rounds.
  room.revision++;
  persist(); broadcast(room);
  return { room: view(room), playerId: player.id };
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/events') {
      const { room, player } = auth(url.searchParams.get('code'), url.searchParams.get('token'));
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 1500\n\n');
      if (!streams.has(player.id)) streams.set(player.id, new Set());
      streams.get(player.id).add(res); broadcast(room);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
      req.on('close', () => {
        clearInterval(heartbeat); streams.get(player.id)?.delete(res);
        if (!streams.get(player.id)?.size) streams.delete(player.id);
        broadcast(room);
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) fail('來源不被允許。', 403);
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 16384) fail('請求內容過大。', 413);
      }
      let data;
      try { data = JSON.parse(raw); } catch { fail('無效的 JSON。'); }
      if (!data || typeof data !== 'object') fail('無效的操作。');
      const result = action(data);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(result));
    }
    const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/client.js': ['client.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
    const asset = ['/join', '/join/'].includes(url.pathname) ? assets['/'] : assets[url.pathname];
    if (req.method !== 'GET' || !asset) fail('找不到頁面。', 404);
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
    res.end(fs.readFileSync(path.join(__dirname, 'public', asset[0])));
  } catch (error) {
    if (res.headersSent) return res.end();
    res.writeHead(error.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.status ? error.message : '伺服器發生錯誤，請稍後重試。' }));
    if (!error.status) console.error(error);
  }
});
if (require.main === module) server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Bingo: http://localhost:${server.address().port}`));
module.exports = { server, lines, canUndo, initialGameState };
