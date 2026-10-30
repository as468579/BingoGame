const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApplication } = require('../src/app');
const { demoCards } = require('../src/domain/card-catalog');

function fixture() {
  const rooms = new Map();
  const repository = { get: code => rooms.get(code), all: () => [...rooms.values()], add: room => rooms.set(room.code, room), save() {} };
  const app = createApplication({ repository });
  const hostToken = randomUUID(), guestToken = randomUUID();
  const host = app.service.execute({ kind: 'create', name: 'Host', token: hostToken, requestId: randomUUID() });
  const code = host.room.code;
  const send = (kind, token = hostToken, extra = {}) => app.service.execute({ kind, token, code, requestId: randomUUID(), ...extra });
  const guest = send('join', guestToken, { name: 'Guest' });
  const room = repository.get(code);
  const prepare = () => {
    for (const player of room.players) send('board', player.token, { board: player.board, ready: true });
    send('start');
  };
  return { ...app, send, prepare, room, host, guest, hostToken, guestToken };
}

test('using a card publishes the same question to all players without revealing the answer', t => {
  const f = fixture(); f.prepare();
  const events = [];
  t.after(f.connections.subscribe(f.guest.playerId, { write: event => events.push(event) }));
  const response = f.send('cardUse', f.hostToken, { cardId: 'star', correct: true });
  const snapshot = f.service.snapshot(f.room, f.guest.playerId);
  assert.deepEqual(response.room.activeCard, snapshot.activeCard);
  assert.equal(snapshot.activeCard.playerId, f.host.playerId);
  assert.equal(snapshot.activeCard.stage, 'question');
  assert.equal(snapshot.activeCard.card.options.length, 4);
  assert.equal(snapshot.activeCard.card.answer, undefined);
  assert.equal(snapshot.activeCard.answer, undefined);
  assert.equal(snapshot.activeCard.correct, undefined);
  assert.ok(events.at(-1).includes(snapshot.activeCard.id));
  assert.equal(response.room.availableDemoCards.length, 2);
  assert.equal(snapshot.availableDemoCards.length, 3);
});

test('card questions pause every game command, including direct API calls and simultaneous card use', () => {
  const f = fixture(); f.prepare(); f.send('cardUse', f.hostToken, { cardId: 'star' });
  const before = structuredClone(f.room);
  for (const kind of ['call', 'approve', 'reject', 'skip', 'undo', 'reset', 'start', 'board', 'settings', 'scan', 'cardUse']) {
    assert.throws(() => f.send(kind, f.hostToken, { number: 1, cardId: 'moon' }), /作答期間暫停/);
  }
  assert.deepEqual(f.room, before);
});

test('only the owner can answer; only the host determines correctness, overriding the sample answer', () => {
  const f = fixture(); f.prepare(); f.send('cardUse', f.hostToken, { cardId: 'star' });
  const id = f.room.activeCard.id;
  assert.throws(() => f.send('cardAnswer', f.guestToken, { cardSessionId: id, choice: 1 }), /只有使用卡片/);
  for (const choice of [-1, 4, 1.5, '1', undefined]) {
    assert.throws(() => f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice }), /有效的答案/);
  }
  const response = f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice: 0, correct: true });
  assert.equal(response.room.activeCard.stage, 'review');
  assert.equal(response.room.activeCard.correct, undefined);
  assert.equal(response.room.activeCard.answer, undefined);
  assert.equal(response.room.activeCard.choice, 0);
  assert.throws(() => f.send('cardJudge', f.guestToken, { cardSessionId: id, correct: true }), /只有房主/);
  assert.throws(() => f.send('cardJudge', f.hostToken, { cardSessionId: 'old', correct: true }), /已結束/);
  for (const correct of [undefined, 'true', 1, null]) {
    assert.throws(() => f.send('cardJudge', f.hostToken, { cardSessionId: id, correct }), /請選擇/);
  }
  assert.throws(() => f.send('call', f.hostToken, { number: 1 }), /暫停/);
  f.send('cardJudge', f.hostToken, { cardSessionId: id, correct: true });
  assert.equal(f.room.activeCard.correct, true);
  assert.throws(() => f.send('cardJudge', f.hostToken, { cardSessionId: id, correct: false }), /等待判定/);
  assert.throws(() => f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice: 1 }), /已回答/);
  assert.throws(() => f.send('call', f.hostToken, { number: 1 }), /暫停/);
  f.send('cardFinish', f.hostToken, { cardSessionId: id });
  assert.equal(f.room.turn, f.guest.playerId);
  assert.throws(() => f.send('call', f.hostToken, { number: 1 }), /等待輪到你/);
  f.send('call', f.guestToken, { number: 1 });
  assert.equal(f.room.pending.number, 1);
});

test('retries cannot consume a card or submit its answer twice; stale session IDs are rejected', () => {
  const f = fixture(); f.prepare();
  const requestId = randomUUID();
  const first = f.send('cardUse', f.hostToken, { cardId: 'star', requestId });
  const id = first.room.activeCard.id;
  const retry = f.send('cardUse', f.hostToken, { cardId: 'star', requestId });
  assert.equal(retry.room.activeCard.id, id);
  assert.equal(f.room.players[0].usedDemoCards.length, 1);
  assert.throws(() => f.send('cardAnswer', f.hostToken, { cardSessionId: 'old', choice: 1 }), /已結束/);
  const answerRequest = randomUUID();
  f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice: 1, requestId: answerRequest });
  f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice: 1, requestId: answerRequest });
  assert.equal(f.room.activeCard.stage, 'review');
  const judgeRequest = randomUUID();
  f.send('cardJudge', f.hostToken, { cardSessionId: id, correct: false, requestId: judgeRequest });
  f.send('cardJudge', f.hostToken, { cardSessionId: id, correct: false, requestId: judgeRequest });
  assert.equal(f.room.activeCard.correct, false);
  f.send('cardFinish', f.hostToken, { cardSessionId: id });
  f.send('call', f.guestToken, { number: 1 });
  f.send('reject', f.hostToken, { pendingId: f.room.pending.id });
  assert.throws(() => f.send('cardUse', f.hostToken, { cardId: 'star' }), /無法使用/);
});

test('the host can end an offline player question; observers cannot end it or answer for them', () => {
  const f = fixture();
  f.send('cardUse', f.guestToken, { cardId: 'shield' });
  const id = f.room.activeCard.id;
  assert.equal(f.connections.isOnline(f.guest.playerId), false);
  assert.throws(() => f.send('cardFinish', f.guestToken, { cardSessionId: id }), /等待作答完成/);
  assert.throws(() => f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice: 2 }), /只有使用卡片/);
  f.send('cardFinish', f.hostToken, { cardSessionId: id });
  assert.equal(f.room.activeCard, null);
  assert.equal(f.room.players[1].usedDemoCards.length, 1);
});

test('completed card use is undone atomically, restoring the card without changing cells or turn', () => {
  const f = fixture(); f.prepare();
  const cells = structuredClone(f.room.players.map(player => player.cells));
  f.send('cardUse', f.hostToken, { cardId: 'moon' });
  const id = f.room.activeCard.id;
  f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice: 1 });
  f.send('cardJudge', f.hostToken, { cardSessionId: id, correct: true });
  f.send('cardFinish', f.hostToken, { cardSessionId: id });
  assert.equal(f.room.history.length, 1);
  assert.equal(f.room.turn, f.guest.playerId);
  f.send('undo', f.hostToken, { revision: f.room.revision });
  assert.equal(f.room.activeCard, null);
  assert.deepEqual(f.room.players[0].usedDemoCards, []);
  assert.equal(f.room.turn, f.host.playerId);
  assert.deepEqual(f.room.players.map(player => player.cells), cells);
  assert.equal(f.service.snapshot(f.room, f.host.playerId).availableDemoCards.length, 3);
  f.send('call', f.hostToken, { number: 1 });
  assert.equal(f.room.pending.playerId, f.host.playerId);
});

test('card use respects turns and pending calls; new rounds replenish demo cards', () => {
  const f = fixture(); f.prepare();
  assert.throws(() => f.send('cardUse', f.guestToken, { cardId: 'star' }), /自己的選號回合/);
  f.send('call', f.hostToken, { number: 1 });
  assert.throws(() => f.send('cardUse', f.hostToken, { cardId: 'star' }), /選號確認/);
  f.send('reject', f.hostToken, { pendingId: f.room.pending.id });
  f.send('cardUse', f.guestToken, { cardId: 'star' });
  const id = f.room.activeCard.id;
  f.send('cardAnswer', f.guestToken, { cardSessionId: id, choice: 1 });
  assert.throws(() => f.send('cardFinish', f.guestToken, { cardSessionId: id }), /等待作答完成/);
  f.send('cardJudge', f.hostToken, { cardSessionId: id, correct: true });
  assert.throws(() => f.send('cardFinish', f.hostToken, { cardSessionId: 'old' }), /已結束/);
  f.send('cardFinish', f.guestToken, { cardSessionId: id });
  f.send('reset');
  assert.equal(f.service.snapshot(f.room, f.guest.playerId).availableDemoCards.length, 3);
});

test('serialized room state restores the same active question and card ownership', () => {
  const f = fixture(); f.prepare(); f.send('cardUse', f.hostToken, { cardId: 'star' });
  const restored = JSON.parse(JSON.stringify(f.room));
  f.repository.add(restored);
  const snapshot = f.service.snapshot(restored, f.host.playerId);
  assert.equal(snapshot.activeCard.id, f.room.activeCard.id);
  assert.equal(snapshot.availableDemoCards.length, 2);
  f.send('cardAnswer', f.hostToken, { cardSessionId: restored.activeCard.id, choice: demoCards[0].answer });
  const review = JSON.parse(JSON.stringify(restored));
  f.repository.add(review);
  assert.equal(f.service.snapshot(review, f.guest.playerId).activeCard.stage, 'review');
  f.send('cardJudge', f.hostToken, { cardSessionId: review.activeCard.id, correct: true });
  assert.equal(review.activeCard.correct, true);
});

for (const correct of [true, false]) test(`card verdict ${correct} consumes the turn exactly once and prevents another card or call`, () => {
  const f = fixture(); f.prepare();
  f.send('cardUse', f.hostToken, { cardId: 'star' });
  const id = f.room.activeCard.id;
  f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice: 1 });
  f.send('cardJudge', f.hostToken, { cardSessionId: id, correct });
  assert.equal(f.room.turn, f.host.playerId);
  const requestId = randomUUID();
  f.send('cardFinish', f.hostToken, { cardSessionId: id, requestId });
  f.send('cardFinish', f.hostToken, { cardSessionId: id, requestId });
  assert.equal(f.room.turn, f.guest.playerId);
  assert.deepEqual(f.room.called, []);
  assert.throws(() => f.send('call', f.hostToken, { number: 1 }), /等待輪到你/);
  assert.throws(() => f.send('cardUse', f.hostToken, { cardId: 'moon' }), /自己的選號回合/);
  f.send('cardUse', f.guestToken, { cardId: 'star' });
  f.send('cardFinish', f.hostToken, { cardSessionId: f.room.activeCard.id });
  assert.equal(f.room.turn, f.host.playerId);
});

for (const stage of ['question', 'review']) test(`host cancellation during ${stage} skips the card user turn`, () => {
  const f = fixture(); f.prepare();
  f.send('cardUse', f.hostToken, { cardId: 'star' });
  const id = f.room.activeCard.id;
  if (stage === 'review') f.send('cardAnswer', f.hostToken, { cardSessionId: id, choice: 0 });
  f.send('cardFinish', f.hostToken, { cardSessionId: id });
  assert.equal(f.room.turn, f.guest.playerId);
  assert.deepEqual(f.room.called, []);
});
