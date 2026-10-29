import { element } from './dom.js';

export function lineMeter(count, goal) {
  const meter = element('span', 'score-meter');
  meter.dataset.goal = goal;
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-label', '連線進度');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', goal);
  meter.setAttribute('aria-valuenow', Math.min(count, goal));
  meter.setAttribute('aria-valuetext', `已完成 ${count} 條線，目標 ${goal} 條線`);
  for (let index = 0; index < goal; index++) {
    meter.append(element('span', index < count ? 'score-segment complete' : 'score-segment'));
  }
  return meter;
}
