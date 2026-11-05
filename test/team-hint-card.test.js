const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { cards } = require('../src/games/teambingo/card-catalog');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { applyCardEffect } = require('../src/games/teambingo/card-effects');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { hintUses, startHint, expireHint } = require('../src/games/teambingo/captain-hint');
const { initializeTeamClock } = require('../src/games/teambingo/team-clock');
const definition = cards.find(card => card.id === 'team-hints-plus-2');

function fixture(t, cardDefinition = definition) {
  t.mock.method(Date, 'now', () => 0);
  const room = { ...game.initializeRoom(), phase: 'playing', revision: 0, host: 'host', turn: 'a',
    captains: { 'team-1': 'captain-a', 'team-2': 'captain-b' }, players:
      [['host', null], ['a', 'team-1'], ['b', 'team-2'], ['captain-a', 'team-1'], ['captain-b', 'team-2']]
        .map(([id, teamId]) => ({ id, name: id, teamId, ready: true, hand: [] })) };
  initializeTeamClock(room, 0);
  const act = (kind, data = {}, id = 'host') => applyGameAction(room, room.players.find(player => player.id === id), { kind, ...data }, { isOnline: () => true }, 0);
  const held = drawForNumber({ hand: room.teamHands['team-1'] ||= [] }, cardDefinition);
  act('cardUse', { cardId: held.id }, 'a');
  const cardSessionId = room.activeCard.id;
  const answer = () => act('cardAnswer', { cardSessionId, ...(room.activeCard.question.type === 'oral' ? { answered: true } : { choice: 0 }) }, 'a');
  return { room, held, act, answer, cardSessionId };
}

test('correct hint card grants exactly two uses to its own team and only once', t => {
  const f = fixture(t);
  assert.equal(definition.name, '提示'); assert.equal(definition.symbol, 'light-bulb');
  assert.equal(definition.questionDifficulty, null);
  assert.equal(hintUses(f.room, 'team-1'), 3);
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  assert.equal(hintUses(f.room, 'team-1'), 5); assert.equal(hintUses(f.room, 'team-2'), 3);
  assert.equal(applyCardEffect(f.room, f.room.activeCard, definition), false);
  assert.equal(game.snapshot(f.room, { isOnline: () => true }, 'captain-a').teams[0].hintUsesRemaining, 5);
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  assert.equal(hintUses(f.room, 'team-1'), 5); assert.equal(f.room.turn, 'b');
});

test('wrong hint card answer grants nothing and still consumes the card and turn', t => {
  const f = fixture(t); f.answer();
  f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: false });
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  assert.equal(hintUses(f.room, 'team-1'), 3);
  assert.equal(f.room.teamHands['team-1'].length, 0); assert.equal(f.room.turn, 'b');
});

test('host-aborted hint card question grants no hint uses', t => {
  const f = fixture(t); f.act('cardFinish', { cardSessionId: f.cardSessionId });
  assert.equal(hintUses(f.room, 'team-1'), 3); assert.deepEqual(f.room.hintBonuses, {});
  assert.equal(f.room.turn, 'b');
});

test('saved successful hint effects remain applied without duplication after restoration', t => {
  const f = fixture(t); f.answer();
  f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  applyGameAction(saved, saved.players[0], { kind: 'cardFinish', cardSessionId: f.cardSessionId }, { isOnline: () => true }, 0);
  assert.equal(hintUses(saved, 'team-1'), 5); assert.equal(saved.hintBonuses['team-1'], 2);
});

test('undo removes bonus hints without refunding spent hints and reset restores the initial allowance', t => {
  const f = fixture(t); f.answer();
  f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  f.room.turn = 'a';
  startHint(f.room, f.room.players.find(player => player.id === 'captain-a'), {}, {}, 0);
  expireHint(f.room, 30000);
  assert.equal(hintUses(f.room, 'team-1'), 4);
  f.act('undo', { revision: f.room.revision });
  assert.equal(hintUses(f.room, 'team-1'), 2);
  assert.equal(f.room.teamHands['team-1'][0].id, f.held.id);
  assert.deepEqual(f.room.hintBonuses, {});
  f.act('reset'); assert.equal(hintUses(f.room, 'team-1'), 3);
});

test('gift card records twenty snow crystals for final settlement without changing the board or allowances', t => {
  const card = cards.find(card => card.id === 'team-snow-crystals-20');
  assert.equal(card.name, '禮物(飄雪結晶)'); assert.equal(card.symbol, 'gift'); assert.deepEqual(card.questionDifficulty, ['簡單', '普通']);
  assert.equal(card.effect, '正確回答問題後獲得飄雪結晶 ×20，回答錯誤則無。');
  const f = fixture(t, card);
  const board = structuredClone(f.room.cells), prizes = structuredClone(f.room.linePrizes), clock = structuredClone(f.room.teamClock);
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  assert.deepEqual(f.room.teamBonusRewards, { 'team-1': { '飄雪結晶': 20 } });
  assert.deepEqual(f.room.cells, board); assert.deepEqual(f.room.linePrizes, prizes);
  assert.deepEqual(f.room.teamClock, clock); assert.equal(hintUses(f.room, 'team-1'), 3);
  assert.equal(f.room.phase, 'playing'); assert.deepEqual(f.room.winners, []);
  assert.deepEqual(game.snapshot(f.room, { isOnline: () => true }, 'host').teams[0].bonusRewards, []);
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  applyGameAction(saved, saved.players[0], { kind: 'cardFinish', cardSessionId: f.cardSessionId }, { isOnline: () => true }, 0);
  assert.equal(saved.teamBonusRewards['team-1']['飄雪結晶'], 20);
  saved.phase = 'finished';
  const snapshot = game.snapshot(saved, { isOnline: () => true }, 'host');
  assert.deepEqual(snapshot.teams[0].bonusRewards, [{ item: '飄雪結晶', quantity: 20 }]);
  assert.deepEqual(snapshot.teams[1].bonusRewards, []);
});

test('wrong or host-aborted gift cards grant no settlement rewards', t => {
  const card = cards.find(card => card.id === 'team-snow-crystals-20');
  const f = fixture(t, card); f.answer();
  f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: false });
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  assert.deepEqual(f.room.teamBonusRewards, {});
  f.room.turn = 'a';
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] }, card);
  f.act('cardUse', { cardId: held.id }, 'a');
  f.act('cardFinish', { cardSessionId: f.room.activeCard.id });
  assert.deepEqual(f.room.teamBonusRewards, {}); assert.equal(f.room.turn, 'b');
});

test('gift rewards accumulate, undo removes only the last award and reset clears settlement totals', t => {
  const card = cards.find(card => card.id === 'team-snow-crystals-20'), f = fixture(t, card);
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  f.room.turn = 'a';
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] }, card);
  f.act('cardUse', { cardId: held.id }, 'a');
  const active = f.room.activeCard, cardSessionId = active.id;
  f.act('cardAnswer', { cardSessionId, ...(active.question.type === 'oral' ? { answered: true } : { choice: 0 }) }, 'a');
  f.act('cardJudge', { cardSessionId, correct: true });
  f.act('cardFinish', { cardSessionId });
  assert.equal(f.room.teamBonusRewards['team-1']['飄雪結晶'], 40);
  f.act('undo', { revision: f.room.revision });
  assert.equal(f.room.teamBonusRewards['team-1']['飄雪結晶'], 20);
  assert.equal(f.room.teamHands['team-1'][0].id, held.id);
  f.act('reset'); assert.deepEqual(f.room.teamBonusRewards, {});
});

test('teleport stone gift awards exactly four to its own team without changing snow crystals or play', t => {
  const card = cards.find(card => card.id === 'team-teleport-stones-4');
  assert.equal(card.name, '禮物(傳送石)'); assert.equal(card.symbol, 'gift');
  assert.deepEqual(card.questionDifficulty, ['簡單', '普通']); assert.equal(card.copiesPerGame, 2);
  const f = fixture(t, card);
  f.room.teamBonusRewards = { 'team-1': { '飄雪結晶': 20 }, 'team-2': { '傳送石': 4 } };
  const board = structuredClone(f.room.cells), prizes = structuredClone(f.room.linePrizes);
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  assert.deepEqual(f.room.teamBonusRewards, { 'team-1': { '飄雪結晶': 20, '傳送石': 4 }, 'team-2': { '傳送石': 4 } });
  assert.deepEqual(f.room.cells, board); assert.deepEqual(f.room.linePrizes, prizes);
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  assert.equal(f.room.turn, 'b'); assert.equal(f.room.phase, 'playing');
  assert.equal(hintUses(f.room, 'team-1'), 3);
});

test('wrong and host-aborted teleport gifts do not grant any settlement rewards', t => {
  const card = cards.find(card => card.id === 'team-teleport-stones-4'), f = fixture(t, card);
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: false });
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  assert.deepEqual(f.room.teamBonusRewards, {});
  f.room.turn = 'a';
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] }, card);
  f.act('cardUse', { cardId: held.id }, 'a');
  f.act('cardFinish', { cardSessionId: f.room.activeCard.id });
  assert.deepEqual(f.room.teamBonusRewards, {});
});

test('teleport gifts persist, settle once, undo atomically and clear on reset', t => {
  const card = cards.find(card => card.id === 'team-teleport-stones-4'), f = fixture(t, card);
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  applyGameAction(saved, saved.players[0], { kind: 'cardFinish', cardSessionId: f.cardSessionId }, { isOnline: () => true }, 0);
  saved.phase = 'finished';
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'host').teams[0].bonusRewards, [{ item: '傳送石', quantity: 4 }]);
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  f.act('undo', { revision: f.room.revision });
  assert.deepEqual(f.room.teamBonusRewards, {});
  assert.equal(f.room.teamHands['team-1'][0].id, f.held.id);
  f.act('reset'); assert.deepEqual(f.room.teamBonusRewards, {});
});

test('raid ticket gift has two copies and grants two tickets without affecting other rewards or play', t => {
  const card = cards.find(card => card.id === 'team-raid-tickets-2');
  assert.equal(card.name, '禮物(突襲卷)'); assert.equal(card.symbol, 'gift');
  assert.equal(card.questionDifficulty, '普通'); assert.equal(card.copiesPerGame, 2);
  const f = fixture(t, card), cells = structuredClone(f.room.cells);
  f.room.teamBonusRewards = { 'team-1': { '飄雪結晶': 20 }, 'team-2': { '突襲券': 2 } };
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  assert.deepEqual(f.room.teamBonusRewards, { 'team-1': { '飄雪結晶': 20, '突襲券': 2 }, 'team-2': { '突襲券': 2 } });
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  assert.deepEqual(f.room.cells, cells); assert.equal(f.room.turn, 'b');
  assert.equal(f.room.teamBonusRewards['team-1']['突襲券'], 2);
});

test('wrong or host-aborted raid ticket gifts grant no tickets', t => {
  const card = cards.find(card => card.id === 'team-raid-tickets-2'), f = fixture(t, card);
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: false });
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  assert.deepEqual(f.room.teamBonusRewards, {});
  f.room.turn = 'a';
  const held = drawForNumber({ hand: f.room.teamHands['team-1'] }, card);
  f.act('cardUse', { cardId: held.id }, 'a');
  f.act('cardFinish', { cardSessionId: f.room.activeCard.id });
  assert.deepEqual(f.room.teamBonusRewards, {});
});

test('raid tickets persist and settle once while undo refunds the card and resets remove the reward', t => {
  const card = cards.find(card => card.id === 'team-raid-tickets-2'), f = fixture(t, card);
  f.answer(); f.act('cardJudge', { cardSessionId: f.cardSessionId, correct: true });
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  applyGameAction(saved, saved.players[0], { kind: 'cardFinish', cardSessionId: f.cardSessionId }, { isOnline: () => true }, 0);
  saved.phase = 'finished';
  assert.deepEqual(game.snapshot(saved, { isOnline: () => true }, 'host').teams[0].bonusRewards, [{ item: '突襲券', quantity: 2 }]);
  f.act('cardFinish', { cardSessionId: f.cardSessionId });
  f.act('undo', { revision: f.room.revision });
  assert.deepEqual(f.room.teamBonusRewards, {});
  assert.equal(f.room.teamHands['team-1'][0].id, f.held.id);
  f.act('reset'); assert.deepEqual(f.room.teamBonusRewards, {});
});

test('every gift effect requires a correct completed verdict before any settlement reward is recorded', () => {
  for (const card of cards.filter(card => card.type === '獎勵')) {
    for (const state of [{ stage: 'question', correct: true }, { stage: 'review', timedOut: true }, { stage: 'result', correct: false }, { stage: 'result', correct: true, effectApplied: true }]) {
      const room = game.initializeRoom(), active = { teamId: 'team-1', ...state };
      const before = structuredClone(room);
      assert.equal(applyCardEffect(room, active, card), false);
      assert.deepEqual(room, before);
    }
  }
});

test('different gift cards accumulate independently and only publish their totals at final settlement', t => {
  const gifts = cards.filter(card => card.type === '獎勵'), f = fixture(t, gifts[0]);
  for (const [index, card] of gifts.entries()) {
    if (index) {
      f.room.turn = 'a';
      const held = drawForNumber({ hand: f.room.teamHands['team-1'] }, card);
      f.act('cardUse', { cardId: held.id }, 'a');
    }
    const active = f.room.activeCard, cardSessionId = active.id;
    f.act('cardAnswer', { cardSessionId, ...(active.question.type === 'oral' ? { answered: true } : { choice: 0 }) }, 'a');
    f.act('cardJudge', { cardSessionId, correct: true });
    f.act('cardFinish', { cardSessionId });
  }
  assert.deepEqual(f.room.teamBonusRewards['team-1'], { '飄雪結晶': 20, '傳送石': 4, '突襲券': 2 });
  assert.deepEqual(game.snapshot(f.room, { isOnline: () => true }, 'host').teams[0].bonusRewards, []);
  f.room.phase = 'finished';
  const snapshot = game.snapshot(f.room, { isOnline: () => true }, 'host');
  assert.deepEqual(snapshot.teams[0].bonusRewards, [
    { item: '飄雪結晶', quantity: 20 }, { item: '傳送石', quantity: 4 }, { item: '突襲券', quantity: 2 }
  ]);
  assert.deepEqual(snapshot.teams[1].bonusRewards, []);
});
