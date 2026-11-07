import { $ } from '../dom.js';
import { LinePrizesView as SharedLinePrizesView } from '../../../views/line-prizes-view.js';
export { linePrizeItems, linePrizes } from '../../../views/line-prizes-view.js';

export class LinePrizesView extends SharedLinePrizesView {
  constructor() { super($); }
}
