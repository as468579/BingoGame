import { $ } from '../../views/dom.js';
import { GameIntroductionView } from '../../views/game-introduction-view.js';
import { bridgeIntroductionIllustration } from './introduction-illustrations.js';

function sections(room) {
  return [
    ['遊戲目標', [`與隊友合作，本局完成 ${room.goal ?? room.size - 2} 條連線即可達標。完整橫線、直線與兩條主要對角線都算連線。`]],
    ['盤面與手牌', ['每隊共用一張獨立盤面，各隊分別佔領自己的格子。', '數字卡有紅、黃、藍三種顏色，隨機平均發給隊員。只能查看自己的手牌。', '可以討論策略，但不能直接透露確切手牌或展示給隊友。'], ['出牌順序', ['每人每輪出一張牌；第一隊全員完成後，再換下一隊。手牌已空的玩家自動略過。', '隊內依加入順序出牌，每輪首位玩家向後輪替一人。']]],
    ['跟色與放置', ['首位玩家可選任意顏色，該牌顏色決定本隊本輪的指定顏色。', '若同隊的後續玩家手中有指定顏色：必須出該色卡片，放在與卡片數字相同的空格。', '反之，若後續玩家手中沒有指定顏色：可以出任意顏色，放在任意尚未佔領的空格。', '已佔領的格子不能覆蓋，已使用的卡片不能再次使用。']],
    ['只能丟棄的情況', ['首位玩家尚無指定顏色，並且該卡片的對應格已被佔領時，只能丟棄這張牌，並以該牌顏色決定本輪指定顏色。', '後續玩家若持有指定顏色，必須出該色卡片；若所選卡片的對應格已被佔領，則需棄牌。即使另有可正常放置的同色牌，也可以選擇棄掉這張被擋住的牌。', '遊戲訣竅：利用缺色可以救回對應格已被佔領的手牌。']],
    ['操作方式', ['點選手牌，確認使用後，再點選盤面亮起的空格完成放置。標示「只能丟棄」的卡片，確認後即丟棄並換下一位。', '取消確認不消耗卡片；正式放置或丟棄後才消耗卡片。'], ['勝負結算', ['所有隊伍完成同一輪後，一起判定勝負。同輪達標的隊伍並列獲勝。', '某隊先達標時，其他隊伍仍可完成該輪。全部手牌用完也會結束；若沒有隊伍達標，則無勝者。'], 'settlement']]
  ];
}

export class BridgeIntroductionView extends GameIntroductionView {
  constructor() {
    super({ lookup: $, sections, illustration: bridgeIntroductionIllustration, ids: {
      button: 'bridgeIntroduction', dialog: 'bridgeIntroductionDialog', body: 'bridgeIntroductionContent',
      previous: 'bridgeIntroductionPrevious', next: 'bridgeIntroductionNext', page: 'bridgeIntroductionPage', close: 'bridgeCloseIntroduction'
    } });
  }
}
