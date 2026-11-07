import { $, element } from './dom.js';
import { GameIntroductionView } from '../../views/game-introduction-view.js';
import { teamIntroductionIllustration } from './introduction-illustrations.js';
import { cardFace } from '../../views/playing-card.js';
import { CardDetailView } from '../../views/card-detail-view.js';

function hiddenGoalReference(index, room, inspect) {
  if (index !== 1) return null;
  const button = element('button', 'primary', '查看所有隱藏條件'); button.type = 'button';
  const panel = element('section', 'team-guide-goal-catalog'); panel.hidden = true;
  panel.id = 'next-introductionGoalCatalog'; button.setAttribute('aria-controls', panel.id);
  panel.setAttribute('aria-label', '目前可選擇的隱藏勝利條件');
  button.setAttribute('aria-expanded', 'false');
  const cards = room.availableHiddenGoals || [];
  button.disabled = !cards.length;
  const hint = element('p', '', '以下為可選條件的規則介紹，不代表任何隊伍已選擇的條件。');
  const list = element('div', 'hidden-goal-cards team-guide-example');
  list.append(...cards.map(card => {
    const face = cardFace({ tag: 'button', className: 'spell-card team-guide-card', type: '隱藏勝利條件',
      art: card.symbol, name: card.name, description: card.effect });
    face.setAttribute('aria-label', `放大查看${card.name}`); face.setAttribute('aria-haspopup', 'dialog');
    face.onclick = () => inspect(card); return face;
  }));
  panel.append(hint, list);
  button.onclick = () => {
    if (button.disabled) return;
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    button.textContent = panel.hidden ? '查看所有隱藏條件' : '收起隱藏條件';
  };
  return { heading: button, content: panel };
}

function sections(room) {
  return [
    ['勝利條件', [
      { title: '隱藏的勝利條件：', description: '這是你們的秘密目標，在開局時由隊長選擇多個勝利條件，只有隊長與房主能查看。你們需要與隊長溝通、和隊友合作，逐個完成勝利條件，獲得獎勵。把全部選定條件都達成後，讓隊伍獲勝，並結束該局遊戲。' },
      { title: '連線勝利：', description: `率先完成 ${room.goal ?? 1} 條連線即宣布獲勝，取得該線獎品，並結束該局遊戲。` }
    ]],
    ['隱藏的勝利條件', ['開局時，隊長會看到可選擇的條件卡。每張卡都有不同目標，請先看清楚卡面上的達成方式，再依畫面指定數量選擇不同條件。', '點選條件卡後，還需要確認才會選定；確認後不能更換。不同隊伍可以選擇相同條件。', '只有隊長與房主能查看你們選定的條件。身為隊員，請透過與隊長溝通、和隊友合作，安排每一步行動。', '每完成一個隱藏條件，該隊會獲得一個獎勵。', '達成其中一項還不算隱藏條件獲勝；必須完成全部選定條件，隊伍才會獲勝，並結束這局遊戲。']],
    ['共用盤面，搶佔你們的地盤', ['所有隊伍共用一張盤面。你圈選的數字會成為自己隊伍的地盤，已被佔領的格子就不能再選。', `你也可以和隊友合作完成 ${room.goal ?? 1} 條連線獲勝：同一條橫線、直線或主要對角線，必須全部屬於你們隊伍。完成連線還能取得該線獎品。`, '選號時，除了推進自己的隱藏目標，也可以搶先佔領格子，阻擋對手連線。']],
    ['佔領特殊格，為隊伍拿卡', ['看到特殊格了嗎？首次佔領特殊格，你的隊伍就有機會獲得一張效果卡。卡池用完後就不再發卡。', '獲得的卡片會放進「隊伍手牌」，隊友輪到行動時也能使用。剛圈選特殊格的當次行動不能接著用卡，請留給之後的回合。', '輪到你時，可以點選手牌查看效果。開始作答前可以取消，記得先與隊長/隊員討論好要不要使用。']],
    ['在有限的時間內達成勝利', ['你和隊友共用同一份行動時間。輪到你們「選號」或「選卡」時才扣時；作答、等待房主判定與隊長提示時都會暫停。', '隊伍時間用完後，每位隊員每次輪到時仍有 3 秒可以行動，超時就換下一位。即使所有隊伍時間都用完，遊戲仍會繼續。', '只要連線達標，或完成全部已選隱藏條件，就會立即判定勝利，不必等待其他隊伍完成同一輪。若盤面已滿仍無人達標，則判定為和局。', '遊戲結束後，可以在結算視窗查看各隊取得的獎品。']],
    ['輪到你時，可以做什麼？', ['留意畫面上的回合提示，各隊會依序輪流行動；輪到自己隊伍時，再由下一位隊員出手。', '數字或是手牌：圈選一個尚未被佔領的數字，或使用一張隊伍效果卡。選好數字就會換人；用卡後，不論回答正誤也會換人。', '隊內依順序循環，人數較少的隊伍會較早回到第一位，不會輪空。例如 A 隊三人、B 隊兩人，順序就是 A1 → B1 → A2 → B2 → A3 → B1。'], ['隊長與提示', ['如果你是隊長，開局時請選擇畫面指定數量的不同隱藏條件，確認後不能更換；不同隊伍可以選擇相同條件。', '隊長不圈號，也不使用效果卡；請在自己隊伍回合使用「提示隊員」協助大家。每隊起始有 3 次提示機會。', '提示時全場暫停 30 秒，倒數結束後由原本玩家繼續行動。房主負責主持與判題，不參與圈號或用卡。']]]
  ];
}

export class TeamIntroductionView extends GameIntroductionView {
  constructor() {
    super({ lookup: $, sections, illustration: teamIntroductionIllustration, supplement: hiddenGoalReference,
      contentKey: room => JSON.stringify([room.size, room.goal, room.availableHiddenGoals]), phases: ['lobby', 'choosing-goal', 'playing'], ids: {
      button: 'introduction', dialog: 'introductionDialog', body: 'introductionContent', previous: 'introductionPrevious',
      next: 'introductionNext', page: 'introductionPage', close: 'closeIntroduction'
    } });
    this.cardDetail = new CardDetailView('next-introductionCardDetailTitle');
    const inspect = card => { if (this.available && this.dialog.open) this.cardDetail.show(card); };
    this.illustration = (index, room) => teamIntroductionIllustration(index, room, inspect);
    this.supplement = (index, room) => hiddenGoalReference(index, room, inspect);
    this.dialog.addEventListener('close', () => this.cardDetail.close());
  }

  render(state) { super.render(state); if (!this.available) this.cardDetail.close(); }
  close() { this.cardDetail?.close(); super.close(); }
}
