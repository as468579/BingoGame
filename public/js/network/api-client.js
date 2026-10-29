import { uuid } from '../utils.js';

export class ApiClient {
  constructor({ session, getRoomCode, notify, fetchRequest = (url, options) => fetch(url, options),
    delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
    Object.assign(this, { session, getRoomCode, notify, fetchRequest, delay });
  }

  async send(kind, extra = {}) {
    // Build once: retries of an accepted request must use the same identity and operation ID.
    const payload = { kind, code: this.getRoomCode(), token: this.session.token, requestId: uuid(), ...extra };
    for (let attempt = 0; attempt < 5; attempt++) {
      let response;
      try {
        response = await this.fetchRequest('/api/action', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(7000)
        });
      } catch {
        if (attempt === 4) throw new Error('連線暫時無法恢復，請稍後再試；遊戲進度已保存在伺服器。');
        this.notify(`正在重新連線…（${attempt + 1}/4）`);
        await this.delay(Math.min(1000 * 2 ** attempt, 8000));
        continue;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '操作失敗，請重試。');
      return result;
    }
  }
}
