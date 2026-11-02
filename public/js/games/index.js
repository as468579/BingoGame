import { BingoView } from './bingo/game-view.js';
import { BingoController } from './bingo/controller.js';
import { BingoState } from './bingo/state.js';
import { BridgeRoomView } from './bridge/game-view.js';
import { BridgeController } from './bridge/controller.js';
import { GameState } from '../state/game-state.js';
import { BingoNextView } from './bingonext/game-view.js';
import { BingoNextController } from './bingonext/controller.js';
import { BingoNextState } from './bingonext/state.js';

const games = new Map([
  ['bingo-next', { id: 'bingo-next', createState: () => new BingoNextState(), createController: app => new BingoNextController(app),
    createView: (actions, context) => new BingoNextView(actions, context.address, context.notify, context.getState), roomPath: () => '/bingo-next' }],
  ['bingo', { id: 'bingo', createState: () => new BingoState(), createController: app => new BingoController(app),
    createView: (actions, context) => new BingoView(actions, context.address, context.notify, context.getState), roomPath: entryPath => entryPath }],
  ['bridge-bingo', { id: 'bridge-bingo', createState: () => new GameState(), createController: app => new BridgeController(app),
    createView: (actions, context) => new BridgeRoomView(actions, context.notify), roomPath: () => '/bridge-bingo' }]
]);

export function getClientGame(type = 'bingo') {
  const game = games.get(type);
  if (!game) throw new Error('不支援的遊戲種類。');
  return game;
}
