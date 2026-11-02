'use strict';
const { randomInt } = require('node:crypto');
const { demoCards } = require('./card-catalog');

// Initial sample bank; question selection is independent of the card's ability.
const questions = demoCards.map(({ id, question, options, answer }) => ({ id, question, options, answer }));
function chooseQuestion(pick = randomInt) { return questions[pick(questions.length)]; }
function findQuestion(id) { return questions.find(question => question.id === id); }
module.exports = { questions, chooseQuestion, findQuestion };
