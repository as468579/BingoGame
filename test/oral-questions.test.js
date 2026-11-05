const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/games/teambingo');
const { questions, findQuestion } = require('../src/games/teambingo/question-bank');
const { cards } = require('../src/games/teambingo/card-catalog');
const { applyGameAction } = require('../src/games/teambingo/actions');
const { drawForNumber } = require('../src/games/teambingo/card-actions');
const { initializeTeamClock, remainingTime } = require('../src/games/teambingo/team-clock');

function fixture(t) {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const original = questions.slice(), difficulty = cards[0].questionDifficulty;
  const oral = findQuestion('anecdote-001');
  t.after(() => { questions.splice(0, questions.length, ...original); cards[0].questionDifficulty = difficulty; });
  questions.splice(0, questions.length, oral); cards[0].questionDifficulty = '普通';
  const room = { ...game.initializeRoom(), code: 'ORAL', gameType: 'teambingo', phase: 'playing', host: 'host', turn: 'owner', revision: 0,
    players: [{ id: 'host', name: 'Host', teamId: 'team-1', hand: [] }, { id: 'teammate', name: 'Teammate', teamId: 'team-1', hand: [] }, { id: 'owner', name: 'Owner', teamId: 'team-2', hand: [] }] };
  initializeTeamClock(room, now);
  const held = drawForNumber({ hand: room.teamHands['team-2'] ||= [] }, require('../src/games/teambingo/card-catalog').cards.find(card => card.id === 'team-time-plus-2m'));
  const act = (kind, player = 'owner', data = {}) => applyGameAction(room, room.players.find(member => member.id === player), { kind, ...data }, { isOnline: () => true }, now);
  act('cardUse', 'owner', { cardId: held.id });
  const id = room.activeCard.id;
  return { room, act: (kind, player, data = {}) => act(kind, player, { cardSessionId: id, ...data }),
    time: value => { now = value; }, snapshot: viewer => game.snapshot(room, { isOnline: () => true }, viewer) };
}

test('oral answers require owner acknowledgment and reveal the reference only to the reviewing host', t => {
  const f = fixture(t);
  assert.equal(f.room.activeCard.answerDeadlineAt, 21000);
  for (const viewer of ['host', 'owner']) {
    const active = f.snapshot(viewer).activeCard;
    assert.equal(active.card.questionType, 'oral'); assert.deepEqual(active.card.options, []);
    assert.equal(active.card.questionCategory, '軼聞趣事');
    assert.equal(active.referenceAnswer, undefined); assert.equal(active.card.referenceAnswer, undefined);
  }
  const before = structuredClone(f.room);
  assert.throws(() => f.act('cardAnswer', 'host', { answered: true }), /只有使用/);
  assert.throws(() => f.act('cardAnswer', 'owner', { choice: 0 }), /已回答/);
  assert.throws(() => f.act('cardAnswer', 'owner', { answered: 'true' }), /已回答/);
  assert.deepEqual(f.room, before);
  f.time(20999); f.act('cardAnswer', 'owner', { answered: true });
  assert.equal(f.room.activeCard.stage, 'review'); assert.equal(f.room.activeCard.choice, undefined);
  assert.equal(f.snapshot('owner').activeCard.answered, true);
  assert.equal(f.snapshot('owner').activeCard.referenceAnswer, undefined);
  assert.match(f.snapshot('host').activeCard.referenceAnswer, /菇菇仔.*殭屍菇菇/);
  f.act('cardJudge', 'host', { correct: false }); f.act('cardFinish', 'owner');
  assert.equal(f.room.turn, 'teammate'); assert.equal(f.room.teamHands['team-2'].length, 0);
  assert.equal(remainingTime(f.room, 'team-2'), 480000);
});

test('oral questions stop at twenty seconds, retain references on migration and let the host decide', t => {
  const f = fixture(t);
  const saved = JSON.parse(JSON.stringify(f.room)); game.migrate(saved);
  assert.equal(saved.activeCard.answerDeadlineAt, 21000);
  assert.equal(saved.activeCard.question.referenceAnswer, f.room.activeCard.question.referenceAnswer);
  f.time(21000);
  assert.throws(() => f.act('cardAnswer', 'owner', { answered: true }), /作答時間已結束/);
  assert.equal(game.tick(f.room, 21000), true);
  assert.equal(f.room.activeCard.stage, 'review'); assert.equal(f.room.activeCard.timedOut, true);
  assert.equal(f.snapshot('owner').activeCard.referenceAnswer, undefined);
  assert.match(f.snapshot('host').activeCard.referenceAnswer, /菇菇寶貝/);
  f.act('cardJudge', 'host', { correct: true }); f.act('cardFinish', 'owner');
  assert.equal(remainingTime(f.room, 'team-2'), 600000);
  assert.equal(f.room.turn, 'teammate');
});
