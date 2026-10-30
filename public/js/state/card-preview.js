export const demoCards = [
  { id: 'star', name: '星光指引', symbol: '✧', theme: 'gold', type: '祝福',
    description: '讓星光為你的盤面帶來新的可能。', question: '5 × 5 的盤面，一共有幾個格子？',
    options: ['20 個', '25 個', '30 個', '35 個'], answer: 1 },
  { id: 'shield', name: '森林守護', symbol: '❈', theme: 'green', type: '守護',
    description: '在關鍵時刻，為自己留下一份守護。', question: '下列哪一種連線方向可以在賓果中計分？',
    options: ['只有橫向', '只有直向', '橫向、直向與斜向', '任意相鄰格子'], answer: 2 },
  { id: 'moon', name: '月影之謎', symbol: '☽', theme: 'violet', type: '奇術',
    description: '翻開謎題，尋找改變局勢的契機。', question: '數列 2、4、6、8 的下一個數字是？',
    options: ['9', '10', '11', '12'], answer: 1 }
];

// Local preview only: no card effects, room commands, or real hand mutations.
export class CardPreview {
  constructor() { this.reset(); }
  reset() { this.remaining = [...demoCards]; this.selected = null; this.stage = 'front'; this.choice = null; }
  open(id) {
    this.selected = this.remaining.find(card => card.id === id) || null;
    this.stage = 'front'; this.choice = null;
  }
  flip() { if (this.selected && this.stage === 'front') this.stage = 'question'; }
  choose(index) {
    if (this.stage === 'question' && Number.isInteger(index) && this.selected.options[index]) this.choice = index;
  }
  submit() {
    if (this.stage !== 'question' || this.choice === null) return false;
    this.correct = this.choice === this.selected.answer;
    this.stage = 'result';
    this.remaining = this.remaining.filter(card => card.id !== this.selected.id);
    return true;
  }
}
