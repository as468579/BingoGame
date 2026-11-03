const { test } = require('node:test');
const assert = require('node:assert/strict');
const { questions, parseQuestions, chooseQuestion, findQuestion } = require('../src/games/bingonext/question-bank');

const sample = () => ({ id: 'q-001', category: '分類', question: '題目？', options: ['甲', '乙'], correctAnswer: 'B', enabled: true });

test('JSON questions load with valid choices and preserve supplied categories, difficulties and answers', () => {
  assert.equal(questions.length, 9);
  assert.ok(questions.every(question => question.enabled && question.answer >= 0 && question.answer < question.options.length));
  assert.equal(findQuestion('star').answer, 1);
  for (const [id, difficulty, correct] of [
    ['party-quest-001', '簡單', '15'], ['party-quest-002', '簡單', '天使猴'], ['party-quest-003', '普通', '90'],
    ['party-quest-004', '簡單', '星期二/黃色'], ['party-quest-005', '簡單', '1100'], ['party-quest-006', '普通', '2']
  ]) {
    const question = findQuestion(id);
    assert.equal(question.category, '組對任務'); assert.equal(question.difficulty, difficulty);
    assert.equal(question.options[question.answer], correct);
  }
});

test('question parsing normalizes letters and whitespace without mutating the file data', () => {
  const row = { ...sample(), id: ' q-001 ', question: ' 題目？ ', correctAnswer: 'b', category: ' 分類 ', options: [' 甲 ', ' 乙 '] };
  const original = structuredClone(row), [question] = parseQuestions([row]);
  assert.equal(question.id, 'q-001'); assert.equal(question.question, '題目？'); assert.equal(question.answer, 1);
  assert.deepEqual(question.options, ['甲', '乙']); assert.deepEqual(row, original);
  assert.equal(parseQuestions([{ ...sample(), enabled: undefined, category: undefined }])[0].enabled, true);
});

test('malformed questions report their row instead of starting with unusable content', () => {
  for (const invalid of [null, { id: '' }, { question: ' ' }, { options: ['甲'] }, { options: ['', '乙'] },
    { options: ['A', 'B', 'C', 'D', 'E'] }, { correctAnswer: 'C' }, { correctAnswer: 'AB' }, { correctAnswer: 1 }, { enabled: 'true' }, { category: 42 }]) {
    assert.throws(() => parseQuestions([invalid === null ? null : { ...sample(), ...invalid }]), /第 1 題/);
  }
});

test('question IDs must be unique even after trimming whitespace', () => {
  assert.throws(() => parseQuestions([sample(), { ...sample(), id: ' q-001 ' }]), /第 2 題.*不可重複/);
});

test('blank and omitted reference answers remain empty rather than selecting an option', () => {
  for (const correctAnswer of ['', '   ', null, undefined]) {
    assert.equal(parseQuestions([{ ...sample(), correctAnswer }])[0].answer, null);
  }
  assert.equal(parseQuestions([{ ...sample(), correctAnswer: ' A ' }])[0].answer, 0);
});

test('the question bank must be an array', () => {
  for (const invalid of [null, {}, 'questions']) assert.throws(() => parseQuestions(invalid), /JSON 陣列/);
});

test('questions support only the three named difficulties and default legacy entries to normal', () => {
  for (const difficulty of ['簡單', '普通', '困難']) {
    assert.equal(parseQuestions([{ ...sample(), difficulty }])[0].difficulty, difficulty);
  }
  assert.equal(parseQuestions([sample()])[0].difficulty, '普通');
  for (const difficulty of ['easy', '', null, 1]) {
    assert.throws(() => parseQuestions([{ ...sample(), difficulty }]), /difficulty.*簡單.*普通.*困難/);
  }
});

test('random selection excludes disabled questions', () => {
  const bank = parseQuestions([sample(), { ...sample(), id: 'disabled', enabled: false }, { ...sample(), id: 'another' }]);
  assert.equal(chooseQuestion(bound => { assert.equal(bound, 2); return 0; }, bank).id, 'q-001');
  assert.equal(chooseQuestion(() => 1, bank).id, 'another');
});

test('empty or fully disabled banks reject a draw without invoking randomness', () => {
  for (const bank of [[], parseQuestions([{ ...sample(), enabled: false }])]) {
    assert.throws(() => chooseQuestion(() => assert.fail('no random choice should be made'), bank), /沒有啟用/);
  }
});

test('card difficulty filters enabled questions strictly, with no fallback or metadata exposure', () => {
  const bank = parseQuestions([
    { ...sample(), id: 'easy', difficulty: '簡單' },
    { ...sample(), id: 'normal', difficulty: '普通' },
    { ...sample(), id: 'hard-off', difficulty: '困難', enabled: false },
    { ...sample(), id: 'hard', difficulty: '困難' }
  ]);
  assert.equal(chooseQuestion(bound => { assert.equal(bound, 1); return 0; }, bank, '困難').id, 'hard');
  assert.equal(chooseQuestion(() => 0, bank, '簡單').id, 'easy');
  assert.throws(() => chooseQuestion(() => 0, bank.slice(0, 3), '困難'), /沒有啟用/);
  assert.throws(() => chooseQuestion(() => 0, bank, 'unknown'), /設定無效/);
  const { publicCard } = require('../src/games/bingonext/card-catalog');
  assert.deepEqual(publicCard({ id: 'power', questionDifficulty: '困難', difficulty: '困難', answer: 1 }), { id: 'power' });
});
