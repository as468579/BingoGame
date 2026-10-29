import { $ } from './dom.js';

export class Notice {
  show(message) {
    $('message').textContent = message;
    $('message').hidden = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { $('message').hidden = true; }, 6500);
  }
}
