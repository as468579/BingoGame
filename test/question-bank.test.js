const { test } = require('node:test');
const assert = require('node:assert/strict');
const { questions, parseQuestions, chooseQuestion, findQuestion } = require('../src/games/teambingo/question-bank');

const sample = () => ({ id: 'q-001', category: '分類', question: '題目？', options: ['甲', '乙'], correctAnswer: 'B', enabled: true });

test('JSON questions load with valid choices and preserve supplied categories, difficulties and answers', () => {
  assert.equal(questions.length, 25);
  assert.ok(questions.every(question => question.question.endsWith('？')));
  assert.ok(questions.every(question => question.enabled && (question.type === 'oral' ? typeof question.referenceAnswer === 'string' : question.answer === null || question.answer >= 0 && question.answer < question.options.length)));
  assert.deepEqual([...new Set(questions.map(question => question.category))], ['組對任務', '軼聞趣事', '無用知識', '突襲週王']);
  for (const id of ['star', 'shield', 'moon']) assert.equal(findQuestion(id), undefined);
  assert.equal(questions.filter(question => question.difficulty === '簡單').length, 14);
  const dragon = findQuestion('anecdote-003');
  assert.equal(dragon.question, '在 Artale 世界中，「闇黑龍王」的型態是甚麼？');
  assert.equal(dragon.type, 'multiple-choice'); assert.equal(dragon.category, '軼聞趣事');
  assert.equal(dragon.options[dragon.answer], '爬蟲類'); assert.equal(dragon.difficulty, '簡單');
  const epinea = findQuestion('anecdote-004');
  assert.equal(epinea.question, '在 Artale 世界中，「艾畢奈亞」的型態是甚麼？');
  assert.equal(epinea.category, '軼聞趣事'); assert.equal(epinea.difficulty, '簡單');
  assert.equal(epinea.answer, 0); assert.equal(epinea.options[epinea.answer], '惡魔');
  const storage = findQuestion('anecdote-005');
  assert.equal(storage.category, '軼聞趣事'); assert.equal(storage.difficulty, '簡單');
  assert.equal(storage.answer, 2); assert.equal(storage.options[storage.answer], '8個');
  const fish = findQuestion('trivia-001');
  assert.equal(fish.question, '請問 tt60309 有幾隻魚？');
  assert.equal(fish.category, '無用知識'); assert.equal(fish.difficulty, '普通');
  assert.deepEqual(fish.options, ['1隻', '2隻', '3隻', '以上皆非']);
  assert.equal(fish.answer, null);
  const blade = findQuestion('trivia-002');
  assert.equal(blade.question, '請問虎尾大刀是誰？');
  assert.equal(blade.category, '無用知識'); assert.equal(blade.difficulty, '簡單');
  assert.deepEqual(blade.options, ['ChillingOGS', 'tt60309', '10YA', 'alb']);
  assert.equal(blade.answer, null);
  const characters = findQuestion('trivia-003');
  assert.equal(characters.question, '(烏魯莊園I是走投無路的人在打的)，請問括號問句包含括號有幾個字元？');
  assert.equal(characters.category, '無用知識'); assert.equal(characters.difficulty, '簡單');
  assert.deepEqual(characters.options, ['15', '16', '17', '18']);
  assert.equal(characters.answer, 2); assert.equal(characters.options[characters.answer], '17');
  const papulatus = findQuestion('raid-boss-001');
  assert.equal(papulatus.category, '突襲週王'); assert.equal(papulatus.difficulty, '困難');
  assert.deepEqual(papulatus.options, ['04:50', '08:50', '11:00', '直接復活術']);
  assert.equal(papulatus.answer, 2); assert.equal(papulatus.options[papulatus.answer], '11:00');
  const revive = findQuestion('raid-boss-002');
  assert.equal(revive.category, '突襲週王'); assert.equal(revive.difficulty, '困難');
  assert.match(revive.question, /電子碼表時間為01:00並且18秒後會歸零/);
  assert.match(revive.question, /同隊的火毒已經躺在地板上/);
  assert.deepEqual(revive.question.split('\n\n'), [
    '請問在困難拉圖斯控時的時候，目前突襲剩餘時為15:26。',
    '已知電子碼表時間為01:00並且18秒後會歸零(全圖殺)，同隊的火毒已經躺在地板上，並且拉圖斯在同秒釋放反盾。',
    '請問身為主教的你該在什麼時候按下復活術？'
  ]);
  assert.deepEqual(revive.options, ['15:09', '15:14', '15:20', '直接按']);
  assert.equal(revive.answer, 1); assert.equal(revive.options[revive.answer], '15:14');
  const zakum = findQuestion('raid-boss-003');
  assert.equal(zakum.category, '突襲週王'); assert.equal(zakum.difficulty, '簡單');
  assert.equal(zakum.question, '請問炎魔的2號手臂不會施放下列哪一個技能？');
  assert.deepEqual(zakum.options, ['亡靈/活屍', '藥水封鎖', '血魔歸一', '虛弱']);
  assert.equal(zakum.answer, 2); assert.equal(zakum.options[zakum.answer], '血魔歸一');
  const zakumAttacks = findQuestion('raid-boss-004');
  assert.equal(zakumAttacks.category, '突襲週王'); assert.equal(zakumAttacks.difficulty, '簡單');
  assert.equal(zakumAttacks.question, '請問炎魔在第3階段的黑水與魔方中間間隔幾次攻擊？');
  assert.deepEqual(zakumAttacks.options, ['3', '4', '5', '6']);
  assert.equal(zakumAttacks.answer, 3); assert.equal(zakumAttacks.options[zakumAttacks.answer], '6');
  const father = findQuestion('anecdote-006');
  assert.equal(father.category, '軼聞趣事'); assert.equal(father.difficulty, '簡單');
  assert.equal(father.question, '下列哪一位是可在墮落城市見到的離家少年阿勒斯的父親？');
  assert.deepEqual(father.options, ['長老斯坦', '比休斯', '約翰', '路卡斯']);
  assert.equal(father.answer, 0); assert.equal(father.options[father.answer], '長老斯坦');
  const feathers = findQuestion('anecdote-007');
  assert.equal(feathers.category, '軼聞趣事'); assert.equal(feathers.difficulty, '普通');
  assert.equal(feathers.question, '勇士之村的武術教練戴著的帽子上有幾根羽毛？');
  assert.deepEqual(feathers.options, ['13', '14', '17', '20']);
  assert.equal(feathers.answer, 0); assert.equal(feathers.options[feathers.answer], '13');
  const kerningNpc = findQuestion('anecdote-008');
  assert.equal(kerningNpc.category, '軼聞趣事'); assert.equal(kerningNpc.difficulty, '普通');
  assert.equal(kerningNpc.question, '下列哪一位是無法在維多利亞島的墮落城市見到的NPC？');
  assert.deepEqual(kerningNpc.options, ['後街吉姆', '麥吉', '達克魯', '休咪']);
  assert.equal(kerningNpc.answer, 1); assert.equal(kerningNpc.options[kerningNpc.answer], '麥吉');
  const potionPrice = findQuestion('anecdote-009');
  assert.equal(potionPrice.category, '軼聞趣事'); assert.equal(potionPrice.difficulty, '簡單');
  assert.equal(potionPrice.question, '下列哪一項藥水在地球防衛總部的售價是錯誤的？');
  assert.deepEqual(potionPrice.options, ['橘色藥水 - 152', '白色藥水 - 300', '烤鰻魚 - 1045', '馴鹿奶 - 5600']);
  assert.equal(potionPrice.answer, 1); assert.equal(potionPrice.options[potionPrice.answer], '白色藥水 - 300');
  const orangePrice = findQuestion('anecdote-010');
  assert.equal(orangePrice.category, '軼聞趣事'); assert.equal(orangePrice.difficulty, '簡單');
  assert.equal(orangePrice.question, '下列哪一項藥水在地球防衛總部的售價是錯誤的？');
  assert.deepEqual(orangePrice.options, ['柳橙 - 100', '藍色藥水 - 190', '活力藥水 - 589', '礦泉水 - 1567']);
  assert.equal(orangePrice.answer, 0); assert.equal(orangePrice.options[orangePrice.answer], '柳橙 - 100');
  const updateNotice = findQuestion('trivia-004');
  assert.equal(updateNotice.category, '無用知識'); assert.equal(updateNotice.difficulty, '困難');
  assert.equal(updateNotice.question, '請問下列哪一個不是Artale World在11/3(二)更新公告中的內容？');
  assert.deepEqual(updateNotice.options, ['兌換券系統上線', '新增倉庫系統提示資訊', '第二波《萬聖節搗蛋大作戰》活動開跑！', '挑戰成為最強百鍊名匠！萬聖節強化競賽']);
  assert.equal(updateNotice.answer, 3); assert.equal(updateNotice.options[updateNotice.answer], '挑戰成為最強百鍊名匠！萬聖節強化競賽');
  const optimizations = findQuestion('trivia-005');
  assert.equal(optimizations.category, '無用知識'); assert.equal(optimizations.difficulty, '困難');
  assert.equal(optimizations.question, '請問下列哪一個不是Artale World在11/3(二)更新公告中的內容優化？');
  assert.deepEqual(optimizations.options, ['修正｢會心之眼｣技能最高等級顯示錯誤的問題', '統一部分萬聖節變身祕藥道具名稱', '修正帳號內僅有一個角色時無法刪除角色的問題', '改善部分地圖的怪物生成位置']);
  assert.equal(optimizations.answer, 3); assert.equal(optimizations.options[optimizations.answer], '改善部分地圖的怪物生成位置');
  for (const [id, difficulty, correct] of [
    ['party-quest-001', '簡單', '15'], ['party-quest-002', '簡單', '天使猴'], ['party-quest-003', '普通', '90'],
    ['party-quest-004', '簡單', '星期二/黃色'], ['party-quest-005', '簡單', '1100'], ['party-quest-006', '普通', '2']
  ]) {
    const question = findQuestion(id);
    assert.equal(question.category, '組對任務'); assert.equal(question.difficulty, difficulty);
    assert.equal(question.options[question.answer], correct);
  }
});

test('oral questions preserve free-text host references without fake answer options', () => {
  const oral = findQuestion('anecdote-001');
  assert.equal(oral.category, '軼聞趣事'); assert.equal(oral.difficulty, '普通');
  assert.equal(oral.type, 'oral'); assert.deepEqual(oral.options, []); assert.equal(oral.answer, null);
  assert.equal(oral.referenceAnswer, '菇菇仔, 菇菇寶貝, 綠菇菇, 藍菇菇, 刺菇菇, 殭屍菇菇');
  const cyclops = findQuestion('anecdote-002');
  assert.equal(cyclops.category, '軼聞趣事'); assert.equal(cyclops.difficulty, '普通');
  assert.equal(cyclops.type, 'oral'); assert.deepEqual(cyclops.options, []);
  assert.equal(cyclops.referenceAnswer, '火獨眼獸, 風獨眼獸, 冰獨眼獸');
  assert.equal(parseQuestions([{ id: 'oral-blank', question: '口頭題', type: 'oral', correctAnswer: '' }])[0].referenceAnswer, '');
  for (const extra of [{ options: ['申論題'] }, { correctAnswer: 42 }, { type: 'essay' }]) {
    assert.throws(() => parseQuestions([{ id: 'bad-oral', question: '口頭題', type: 'oral', ...extra }]), /第 1 題/);
  }
});

test('time cards can draw every enabled category and difficulty without restricting the question pool', () => {
  const { cards } = require('../src/games/teambingo/card-catalog');
  assert.equal(cards[0].questionDifficulty, null);
  const before = structuredClone(questions);
  const selected = questions.map((_, index) => chooseQuestion(bound => { assert.equal(bound, questions.length); return index; }, questions, cards[0].questionDifficulty));
  assert.deepEqual(selected.map(question => question.id), questions.map(question => question.id));
  assert.deepEqual(new Set(selected.map(question => question.difficulty)), new Set(['簡單', '普通', '困難']));
  assert.deepEqual(new Set(selected.map(question => question.category)), new Set(['組對任務', '軼聞趣事', '無用知識', '突襲週王']));
  assert.deepEqual(questions, before);
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
  const { publicCard } = require('../src/games/teambingo/card-catalog');
  assert.deepEqual(publicCard({ id: 'power', questionDifficulty: '困難', difficulty: '困難', answer: 1 }), { id: 'power' });
});
