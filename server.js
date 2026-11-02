'use strict';
const { createApplication } = require('./src/app');
const { lines } = require('./src/games/bingo/board');
const { canUndo, initialGameState } = require('./src/games/bingo/history');
const { server } = createApplication();

if (require.main === module) {
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
    console.log(`Bingo: http://localhost:${server.address().port}`);
  });
}

// Keep the original entry point compatible with existing launch commands and integration tests.
module.exports = { server, lines, canUndo, initialGameState, createApplication };