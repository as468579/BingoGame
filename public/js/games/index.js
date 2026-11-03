import { BingoView } from './bingo/game-view.js';
import { BingoController } from './bingo/controller.js';
import { BingoState } from './bingo/state.js';
import { BridgeRoomView } from './bridge/game-view.js';
import { BridgeController } from './bridge/controller.js';
import { GameState } from '../state/game-state.js';
import { TeamBingoView } from './teambingo/game-view.js';
import { TeamBingoController } from './teambingo/controller.js';
import { TeamBingoState } from './teambingo/state.js';

const games = new Map([
  ['teambingo', { id: 'teambingo', createState: () => new TeamBingoState(), createController: app => new TeamBingoController(app),
    createView: (actions, context) => new TeamBingoView(actions, context.address, context.notify, context.getState), roomPath: () => '/teambingo' }],
  ['bingo', { id: 'bingo', createState: () => new BingoState(), createController: app => new BingoController(app),
    createView: (actions, context) => new BingoView(actions, context.address, context.notify, context.getState), roomPath: entryPath => entryPath }],
  ['bridge-bingo', { id: 'bridge-bingo', createState: () => new GameState(), createController: app => new BridgeController(app),
    createView: (actions, context) => new BridgeRoomView(actions, context.notify), roomPath: () => '/bridge-bingo' }]
]);

export function getClientGame(type = 'bingo') {
  const game = games.get(type === 'bingo-next' ? 'teambingo' : type);
  if (!game) throw new Error('不支援的遊戲種類。');
  return game;
}
