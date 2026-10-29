'use strict';
const $ = id => document.getElementById(id);
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
// Tabs remember their selected ID independently; the server restores that ID's player.
let token = sessionStorage.getItem('bingo-token');
if (!token) {
  const legacyToken = localStorage.getItem('bingo-token');
  token = legacyToken || uuid(); sessionStorage.setItem('bingo-token', token);
  if (legacyToken) {
    for (const key of ['bingo-name', 'bingo-room']) {
      const value = localStorage.getItem(key); if (value) sessionStorage.setItem(key, value);
    }
    for (const key of ['bingo-token', 'bingo-name', 'bingo-room']) localStorage.removeItem(key);
  }
}
let room = null, playerId = null, selected = null, events = null, busy = false, connected = false;
let draft = Array.from({ length: 25 }, (_, i) => i + 1), draftDirty = false;
let messageTimer, settingsDirty = false, visibleTurnKey = null;
const query = new URLSearchParams(location.search);
const joinPage = /^\/join\/?$/.test(location.pathname);
if (joinPage) {
  document.title = '加入朋友的房間 · Alberta Events';
  $('welcomeTitle').textContent = '你的座位，已經留好。';
  $('welcomeText').textContent = '輸入玩家 ID 與房號，就能和朋友一起玩。同一房間使用相同 ID，會恢復原本的玩家與盤面。';
  $('entryTitle').textContent = '加入朋友的房間';
  $('create').hidden = true; $('joinDivider').hidden = true; $('hostEntry').hidden = false;
  $('entryHint').textContent = '每位玩家請使用不同 ID；恢復原玩家時，請輸入完全相同的 ID（區分大小寫）。';
  document.body.classList.add('join-page');
}
$('publicAddress').value = localStorage.getItem('bingo-public-origin') || '';
$('code').value = query.get('room') || sessionStorage.getItem('bingo-room') || '';
$('name').value = sessionStorage.getItem('bingo-name') || '';
function notify(message) {
  $('message').textContent = message; $('message').hidden = false;
  clearTimeout(messageTimer); messageTimer = setTimeout(() => { $('message').hidden = true; }, 6500);
}
function connection(ok) {
  connected = ok;
  $('connection').textContent = ok ? '● 已連線 · 即時同步' : '◌ 連線中斷 · 自動重連中';
  if (room) render();
}
function update(snapshot) {
  if (room && snapshot.code === room.code && snapshot.revision < room.revision) return;
  if (room && (room.code !== snapshot.code || room.boardVersion !== snapshot.boardVersion)) {
    draftDirty = false; settingsDirty = false;
  }
  room = snapshot;
  if (!selected || !room.players.some(p => p.id === selected)) selected = playerId;
  const me = room.players.find(p => p.id === playerId);
  if (me && !draftDirty) draft = [...me.board];
  render();
}
function connect() {
  events?.close();
  events = new EventSource(`/events?code=${encodeURIComponent(room.code)}&token=${encodeURIComponent(token)}`);
  events.onopen = () => connection(true);
  events.onmessage = e => { connection(true); update(JSON.parse(e.data)); };
  events.onerror = () => connection(false);
}
function lineMeter(count) {
  const goal = room?.goal || 5;
  const meter = document.createElement('span'); meter.className = 'score-meter';
  meter.dataset.goal = goal;
  meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-label', '連線進度');
  meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', goal);
  meter.setAttribute('aria-valuenow', Math.min(count, goal)); meter.setAttribute('aria-valuetext', `已完成 ${count} 條線，目標 ${goal} 條線`);
  for (let i = 0; i < goal; i++) {
    const segment = document.createElement('span'); segment.className = i < count ? 'score-segment complete' : 'score-segment'; meter.append(segment);
  }
  return meter;
}
async function api(kind, extra = {}) {
  const payload = { kind, code: room?.code, token, requestId: uuid(), ...extra };
  // Every retry carries the same ID: an accepted action is never applied twice.
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(7000) });
    } catch (error) {
      if (attempt === 4) throw new Error('連線暫時無法恢復，請稍後再試；遊戲進度已保存在伺服器。');
      notify(`正在重新連線…（${attempt + 1}/4）`);
      await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 8000)));
      continue;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '操作失敗，請重試。');
    return result;
  }
}
async function perform(callback) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('.entry button').forEach(button => { button.disabled = true; });
  if (room) render();
  try { await callback(); } catch (error) { notify(error.message); }
  finally {
    busy = false;
    document.querySelectorAll('.entry button').forEach(button => { button.disabled = false; });
    if (room) render();
  }
}
async function enter(kind) {
  const result = await api(kind, { name: $('name').value, code: $('code').value.trim().toUpperCase() });
  token = result.token; sessionStorage.setItem('bingo-token', token);
  playerId = result.playerId; selected = playerId; draftDirty = false;
  sessionStorage.setItem('bingo-name', $('name').value.trim());
  sessionStorage.setItem('bingo-room', result.room.code);
  history.replaceState(null, '', `?room=${result.room.code}`);
  update(result.room); connect();
}
function render() {
  $('welcome').hidden = true; $('game').hidden = false; $('leave').hidden = false; $('switchPlayer').hidden = false;
  $('roomCode').textContent = room.code;
  $('invitePanel').hidden = room.host !== playerId;
  updateInvitation();
  const readyCount = room.players.filter(p => p.ready).length;
  $('playerCount').textContent = room.phase === 'lobby' ? `${readyCount} / ${room.players.length} 已準備` : `${room.players.length} / 16`;
  const me = room.players.find(p => p.id === playerId);
  const target = room.players.find(p => p.id === selected) || me;
  if (!target || !me) return;
  const mine = target.id === playerId;
  const size = room.size || 5, count = size * size;
  $('settingsPanel').hidden = me.id !== room.host || room.phase !== 'lobby';
  if (!settingsDirty) $('boardSize').value = size;
  $('boardSize').disabled = busy || !connected;
  $('applySize').disabled = busy || !connected;
  $('sizeHint').textContent = `目前 ${size} × ${size} · 數字 1～${count} · 先完成 ${room.goal} 條線獲勝`;
  $('rulesText').textContent = `本局 ${size} × ${size}，數字 1～${count}。輪流選號，房主確認後同步標記。橫、直、斜皆可連線，先完成 ${room.goal} 條線獲勝，可同時獲勝。`;
  $('board').dataset.size = size;
  $('board').setAttribute('aria-label', `${size} 乘 ${size} 賓果盤面`);
  const editing = mine && room.phase === 'lobby' && !me.ready;
  const turn = room.players.find(p => p.id === room.turn);
  const pendingPlayer = room.players.find(p => p.id === room.pending?.playerId);
  const needsApproval = room.phase === 'playing' && room.pending && me.id === room.host;
  if (needsApproval) {
    $('confirmDescription').textContent = `${pendingPlayer?.name || '玩家'} 選擇了以下號碼，是否確認？`;
    $('pendingNumber').textContent = room.pending.number;
    $('approveCall').disabled = busy || !connected; $('rejectCall').disabled = busy || !connected;
    if (!$('confirmCall').open) $('confirmCall').showModal();
  } else if ($('confirmCall').open) $('confirmCall').close();
  const rankedPlayers = room.players.map((p, index) => ({ ...p, joinOrder: index }))
    .sort((a, b) => b.lines - a.lines || a.joinOrder - b.joinOrder);
  const playerList = $('players');
  const previousScroll = playerList.scrollTop;
  $('players').replaceChildren(...rankedPlayers.map((p, rank) => {
    const button = document.createElement('button'); button.className = `player${p.id === target.id ? ' active' : ''}${room.phase === 'playing' && p.id === room.turn ? ' is-turn' : ''}`;
    const avatar = document.createElement('span'); avatar.className = 'avatar';
    avatar.textContent = room.phase === 'lobby' ? p.name.slice(0, 1) : rank + 1;
    avatar.title = room.phase === 'lobby' ? p.name : `排名第 ${rank + 1}`;
    const label = document.createElement('span'); label.className = 'player-name';
    const name = document.createElement('strong'); name.textContent = `${p.name}${p.id === playerId ? '（你）' : ''}`;
    const nameRow = document.createElement('span'); nameRow.className = 'player-heading';
    const role = document.createElement('span'); role.className = 'player-role'; role.textContent = p.id === room.host ? '房主' : '玩家';
    nameRow.append(name, role);
    const status = document.createElement('span');
    status.className = `ready-badge ${p.ready ? 'is-ready' : 'not-ready'}`;
    status.textContent = p.ready ? '✓ 已準備' : '◷ 待準備';
    if (room.phase === 'playing' && p.id === room.turn) {
      const badge = document.createElement('span'); badge.className = 'turn-badge'; badge.textContent = '▶ 選號中';
      label.append(badge);
    }
    const dot = document.createElement('span'); dot.className = `dot${p.online ? ' online' : ''}`; dot.title = p.online ? '在線上' : '已離線';
    label.append(nameRow);
    if (room.phase === 'lobby') label.append(status);
    if (room.phase !== 'lobby') {
      const score = document.createElement('span'); score.className = 'player-score';
      const count = document.createElement('strong'); count.className = 'score-number'; count.textContent = p.lines;
      const unit = document.createElement('span'); unit.className = 'score-unit'; unit.textContent = '條線';
      score.append(count, unit); label.append(score, lineMeter(p.lines));
    }
    button.append(avatar, label, dot);
    button.onclick = () => { selected = p.id; render(); }; return button;
  }));
  playerList.scrollTop = previousScroll;
  const turnKey = `${room.code}:${room.phase === 'playing' ? room.turn : ''}`;
  if (turnKey !== visibleTurnKey) {
    visibleTurnKey = turnKey;
    const currentPlayer = playerList.querySelector('.is-turn');
    if (currentPlayer) {
      // Scroll this list only; scrollIntoView would also move the page and Bingo board.
      const listBounds = playerList.getBoundingClientRect();
      const playerBounds = currentPlayer.getBoundingClientRect();
      const scale = listBounds.height / playerList.clientHeight || 1;
      if (playerBounds.top < listBounds.top || playerBounds.bottom > listBounds.bottom) {
        playerList.scrollTop += (playerBounds.top - listBounds.top - (listBounds.height - playerBounds.height) / 2) / scale;
      }
    }
  }
  $('boardOwner').textContent = mine ? 'YOUR BOARD' : 'FRIEND’S BOARD';
  $('boardTitle').textContent = mine ? '我的幸運盤面' : `${target.name} 的盤面`;
  const lineTotal = document.createElement('strong'); lineTotal.className = 'line-total'; lineTotal.textContent = target.lines;
  const lineGoal = document.createElement('span'); lineGoal.className = 'line-goal'; lineGoal.textContent = `/ ${room.goal} 條線`;
  $('lineCount').replaceChildren(lineTotal, lineGoal, lineMeter(target.lines));
  $('phaseText').textContent = room.phase === 'lobby'
    ? (me.ready ? `✓ 你已準備完成，等待房主開始（${size} × ${size}）。` : `填入 1～${count}，不重複排列，完成後按下準備。`)
    : room.phase === 'finished' ? '本局已結束，好運屬於每個參與的人！'
      : room.pending ? `${pendingPlayer?.name || '玩家'} 選擇了 ${room.pending.number}，等待房主確認…`
        : `${room.lastDecision && !room.lastDecision.approved ? `房主已拒絕號碼 ${room.lastDecision.number}，換下一位。` : ''}${turn?.id === playerId ? '輪到你了！點擊自己盤面上尚未選過的號碼。' : `等待 ${turn?.name || ''} 選號${turn && !turn.online ? '（目前離線，等待重連或由房主略過）' : '…'}`}`;
  const values = editing ? draft : target.board;
  const marked = new Set(room.called);
  // Preserve a focused editor during presence updates so typing is not interrupted.
  const focusedCell = document.activeElement?.dataset?.cell;
  const cells = values.map((number, index) => {
    const cell = document.createElement(editing ? 'input' : 'button'); cell.className = 'cell';
    cell.setAttribute('aria-label', `第 ${Math.floor(index / size) + 1} 列第 ${index % size + 1} 格，號碼 ${number}`);
    if (editing) {
      cell.type = 'number'; cell.min = '1'; cell.max = count; cell.inputMode = 'numeric'; cell.value = number || ''; cell.dataset.cell = index;
      cell.disabled = busy;
      cell.oninput = () => { draft[index] = cell.value === '' ? 0 : Number(cell.value); draftDirty = true; validateDraft(); };
    } else {
      cell.textContent = number;
      if (marked.has(number)) cell.classList.add('marked');
      if (number === room.called.at(-1)) cell.classList.add('latest');
      cell.disabled = busy || !connected || !mine || room.phase !== 'playing' || Boolean(room.pending) || room.turn !== playerId || marked.has(number);
      cell.onclick = () => perform(async () => { const result = await api('call', { number }); update(result.room); });
    }
    return cell;
  });
  $('board').replaceChildren(...cells);
  if (editing && focusedCell !== undefined) $('board').querySelector(`[data-cell="${focusedCell}"]`)?.focus();
  if (editing) validateDraft();
  $('editTools').hidden = !mine || room.phase !== 'lobby';
  $('shuffle').hidden = me.ready;
  $('shuffle').disabled = busy;
  $('ready').textContent = me.ready ? '修改盤面 / 取消準備' : '確認盤面，準備好了 ✓';
  $('ready').disabled = busy || !connected;
  $('boardHint').textContent = !mine ? '正在查看朋友的盤面；點擊自己的名字即可返回。' : editing ? `每個格子都可以直接輸入數字，1～${count} 各使用一次。` : '盤面已保存；重新整理或短暫斷線後會自動恢復。';
  $('hostTools').hidden = me.id !== room.host;
  $('start').hidden = room.phase !== 'lobby';
  $('start').disabled = busy || !connected || room.players.length < 2 || !room.players.every(p => p.ready);
  $('start').textContent = room.players.length < 2 ? '等待至少 2 位玩家加入'
    : readyCount < room.players.length ? `等待 ${room.players.length - readyCount} 位玩家準備` : '全員已準備，開始遊戲 →';
  $('skip').hidden = room.phase !== 'playing' || Boolean(room.pending) || !turn || turn.online;
  $('skip').disabled = busy || !connected;
  $('reset').hidden = room.phase === 'lobby'; $('reset').disabled = busy || !connected;
  $('undo').hidden = room.phase === 'lobby';
  $('undo').title = room.canUndo ? '撤回最近一次操作，可一路退回本局剛開始' : '已到本局剛開始';
  for (const id of ['undo', 'undoPending']) $(id).disabled = busy || !connected || !room.canUndo;
  $('lastNumber').textContent = room.called.at(-1) || '—';
  $('history').replaceChildren(...room.called.map(number => { const span = document.createElement('span'); span.textContent = number; return span; }));
  $('winner').textContent = room.winners.length ? `✳ ${room.players.filter(p => room.winners.includes(p.id)).map(p => p.name).join('、')} Bingo！` : '';
}
function validateDraft() {
  [...$('board').children].forEach((cell, i) => cell.classList.toggle('invalid', !Number.isInteger(draft[i]) || draft[i] < 1 || draft[i] > (room.size || 5) ** 2 || draft.filter(n => n === draft[i]).length > 1));
}
$('boardSize').onchange = () => { settingsDirty = true; };
$('applySize').onclick = () => {
  const size = Number($('boardSize').value);
  perform(async () => {
    const result = await api('settings', { size }); settingsDirty = false; update(result.room);
    notify(`已套用 ${size} × ${size}，請所有玩家確認盤面並準備。`);
  });
};
$('create').onclick = () => perform(() => enter('create'));
$('join').onclick = () => perform(() => enter('join'));
$('confirmCall').addEventListener('cancel', event => event.preventDefault());
for (const id of ['undo', 'undoPending']) $(id).onclick = () => {
  const revision = room.revision;
  perform(async () => {
    const result = await api('undo', { revision }); update(result.room);
    notify(!result.room.canUndo ? '已回到本局剛開始，由第一位玩家重新選號。' : '已回到上一步，所有玩家的盤面與回合同步恢復。');
  });
};
for (const [id, kind] of [['approveCall', 'approve'], ['rejectCall', 'reject']]) $(id).onclick = () => {
  const pendingId = room?.pending?.id;
  if (!pendingId) return;
  perform(async () => { const result = await api(kind, { pendingId }); update(result.room); });
};
$('shuffle').onclick = () => {
  draft = Array.from({ length: room.size ** 2 }, (_, i) => i + 1);
  for (let i = draft.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [draft[i], draft[j]] = [draft[j], draft[i]]; }
  draftDirty = true; render();
};
$('ready').onclick = () => perform(async () => {
  const me = room.players.find(p => p.id === playerId);
  const result = await api('board', { board: me.ready ? me.board : draft, ready: !me.ready, boardVersion: room.boardVersion });
  draftDirty = false; update(result.room);
});
for (const kind of ['start', 'skip', 'reset']) $(kind).onclick = () => {
  if (kind === 'reset' && !confirm('要結束目前這一局並讓所有玩家重新準備嗎？')) return;
  perform(async () => { const result = await api(kind); draftDirty = false; update(result.room); });
};
function updateInvitation() {
  const origin = localStorage.getItem('bingo-public-origin') || location.origin;
  $('inviteLink').value = `${origin}/join?room=${room.code}`;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname);
  $('inviteHint').textContent = local
    ? '目前網址僅限本機使用。請在上方填入 http://你的Public-IP:3000 並儲存。'
    : '朋友開啟連結後只需填暱稱。請先完成路由器轉送與防火牆設定；儲存網址不會自動開通外網。';
}
$('saveAddress').onclick = () => {
  const value = $('publicAddress').value.trim();
  if (!value) {
    localStorage.removeItem('bingo-public-origin'); updateInvitation(); notify('已恢復使用目前網站網址。'); return;
  }
  try {
    const address = new URL(value);
    if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || address.pathname !== '/' || address.search || address.hash) throw new Error();
    localStorage.setItem('bingo-public-origin', address.origin);
    $('publicAddress').value = address.origin; updateInvitation(); notify('公開網址已儲存，可以複製邀請連結了。');
  } catch { notify('請填寫完整網址，例如 http://203.0.113.10:3000，不要包含房號或路徑。'); }
};
async function copyInvitation() {
  updateInvitation();
  try { await navigator.clipboard.writeText($('inviteLink').value); notify('加入連結已複製，傳給朋友就能加入！'); }
  catch {
    // Clipboard API is unavailable on public HTTP addresses. Keep the link selectable.
    if ($('invitePanel').hidden) { notify(`加入連結：${$('inviteLink').value}`); return; }
    $('inviteLink').focus(); $('inviteLink').select(); notify('請複製已選取的加入連結，再傳給朋友。');
  }
}
$('copy').onclick = async () => {
  const code = room.code;
  try {
    await navigator.clipboard.writeText(code);
    notify(`房號 ${code} 已複製。`);
  } catch {
    // Public HTTP pages may lack Clipboard API; provide selectable room code instead.
    const selection = window.getSelection();
    const range = document.createRange(); range.selectNodeContents($('roomCode'));
    selection.removeAllRanges(); selection.addRange(range);
    notify(`請複製已選取的房號：${code}`);
  }
};
$('copyInvite').onclick = copyInvitation;
for (const id of ['name', 'code']) $(id).addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) perform(() => enter('join'));
});
$('leave').onclick = () => {
  events?.close(); events = null; room = null; connected = false; draftDirty = false;
  sessionStorage.removeItem('bingo-room'); history.replaceState(null, '', joinPage ? '/join' : '/');
  $('welcome').hidden = false; $('game').hidden = true; $('leave').hidden = true; $('switchPlayer').hidden = true;
  if ($('confirmCall').open) $('confirmCall').close();
  $('connection').textContent = '● 尚未加入';
};
$('switchPlayer').onclick = () => {
  if (busy) return;
  const code = room.code; $('leave').onclick();
  $('code').value = code; $('name').value = ''; sessionStorage.removeItem('bingo-name');
  history.replaceState(null, '', `${joinPage ? '/join' : '/'}?room=${code}`);
  $('name').focus(); notify('請輸入玩家 ID：同 ID 恢復原玩家，不同 ID 加入為新玩家。');
};
// The bearer identity lives in this browser; room state remains authoritative on the server.
const savedRoom = sessionStorage.getItem('bingo-room');
if (savedRoom && ((!joinPage && !query.get('room')) || query.get('room')?.toUpperCase() === savedRoom)) {
  $('code').value = savedRoom;
  perform(() => enter('join'));
}
