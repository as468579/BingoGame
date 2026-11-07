const { test } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/games/teambingo/hidden-goal-catalog');
const { hasHiddenVictory } = require('../src/games/teambingo/victory');
const { goalProgress } = require('../src/games/teambingo/goal-progress');

// Independent rule oracle, using board coordinates and the own-team call suffix.
function expected(room, id) {
  const own = cell => cell.isCovered && cell.teamId === 'team-1';
  const owned = room.cells.filter(own).map(cell => cell.number);
  if (id === 'mathematician') return owned.filter(n => n > 1 && !Array.from({ length: n - 2 }, (_, i) => i + 2).some(d => n % d === 0)).length >= room.size - 1;
  if (id === 'four-corners') return [0, room.size - 1, room.size ** 2 - room.size, room.size ** 2 - 1].every(i => own(room.cells[i]));
  if (id === 'almost-bingo') {
    const k = room.size, rows = Array.from({ length: k }, (_, r) => Array.from({ length: k }, (_, c) => r * k + c));
    const cols = Array.from({ length: k }, (_, c) => Array.from({ length: k }, (_, r) => r * k + c));
    const diagonals = [Array.from({ length: k }, (_, i) => i * k + i), Array.from({ length: k }, (_, i) => i * k + k - i - 1)];
    return [...rows, ...cols, ...diagonals].some(line => line.map(i => own(room.cells[i]) ? '1' : '0').join('').includes('1'.repeat(k - 1)));
  }
  if (id === 'consecutive-numbers') {
    const calls = room.called.filter(n => owned.includes(n)).reverse();
    return calls.length >= room.size && calls.slice(0, room.size).every((n, i) => n === calls[0] - i);
  }
  const definition = catalog.find(card => card.id === id);
  if (definition.divisor) return room.cells.filter(c => c.number % definition.divisor === 0).every(own);
  if (definition.roundSum) return room.cells.filter(c => own(c) && c.claimedRound === room.roundNumber).reduce((sum, c) => sum + c.number, 0) === definition.roundSum;
  if (id === 'sage') return room.teamCorrectAnswers['team-1'] >= 4;
  if (id === 'reckless') return room.teamWrongAnswers['team-1'] >= 3;
  if (id === 'anticipate-opponent') return room.hiddenGoals.achieved['team-1'];
  if (id === 'quick-finish') return expected(room, 'sage') && expected(room, 'reckless') && room.teamClock.remaining['team-1'] > 360000;
  throw new Error(`Missing audit oracle: ${id}`);
}
let seed = 1749;
const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
for (const definition of catalog.filter(card => !card.id.startsWith('pending-'))) {
  test(`rule audit: ${definition.name} matches an independent oracle across board sizes and team ownership`, () => {
    for (let size = 3; size <= 9; size++) for (let sample = 0; sample < 80; sample++) {
      const numbers = Array.from({ length: size ** 2 }, (_, i) => i + 1);
      for (let i = numbers.length - 1; i > 0; i--) { const j = random(i + 1); [numbers[i], numbers[j]] = [numbers[j], numbers[i]]; }
      const cells = numbers.map(number => ({ number, isCovered: random(4) !== 0, teamId: random(2) ? 'team-1' : 'team-2', claimedRound: random(3) + 1 }));
      const room = { size, cells, called: [...numbers].reverse(), roundNumber: 2,
        teamCorrectAnswers: { 'team-1': random(7) }, teamWrongAnswers: { 'team-1': random(6) },
        hiddenGoals: { requiredCount: definition.id === 'quick-finish' ? 3 : 1,
          choices: { 'team-1': definition.id === 'quick-finish' ? ['quick-finish', 'sage', 'reckless'] : definition.id },
          achieved: { 'team-1': Boolean(random(2)) }, completed: {} },
        teamClock: { remaining: { 'team-1': [359999, 360000, 360001][sample % 3] }, activeTeamId: null, startedAt: null } };
      assert.equal(hasHiddenVictory(room, 'team-1', 0), expected(room, definition.id), `${size}x${size}, sample ${sample}`);
      const progress = goalProgress(room, 'team-1', definition.id);
      if (progress) assert.ok(progress.target > 0 && progress.current >= 0);
    }
  });
}
