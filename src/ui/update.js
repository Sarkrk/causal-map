// @ts-check
// 데이터 갱신: '최신 데이터 받기' 버튼과 결과 한 줄. 새 데이터는 migrate·validate를 통과한 경우에만 캐시에 저장하고 다시 연다.
import { checked, CACHE_KEY } from '../data/loader.js';

/**
 * @typedef {Object} UpdateOpts
 * @property {{version?: string}} meta
 * @property {HTMLButtonElement} dupd
 * @property {HTMLElement} dmsg
 * @property {{setItem: (k: string, v: string) => void}} storage
 * @property {(url: string, init?: RequestInit) => Promise<Response>} fetchFn
 * @property {() => void} reload
 */

/**
 * @param {UpdateOpts} o
 * @returns {void}
 */
export function initUpdate(o) {
  const { meta: m, dupd, dmsg, storage, fetchFn, reload } = o;

  dupd.addEventListener('click', async () => {
    dupd.disabled = true;
    dmsg.textContent = '확인 중…';
    try {
      const r = await fetchFn('graph.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const x = await r.json();
      if (x.meta && m.version === x.meta.version) {
        dmsg.textContent = '이미 최신입니다';
        dupd.disabled = false;
        return;
      }
      checked(x);
      storage.setItem(CACHE_KEY, JSON.stringify(x));
      dmsg.textContent = '새 데이터를 적용합니다…';
      setTimeout(() => reload(), 400);
    } catch {
      dmsg.textContent = '받지 못했습니다. 인터넷 연결을 확인해 주세요.';
      dupd.disabled = false;
    }
  });
}
