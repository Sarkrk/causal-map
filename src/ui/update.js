// @ts-check
// 데이터 갱신: 상단 ⟳ 버튼 삽입, 데이터 정보 문구, '최신 데이터 받기'. 원본 165~172행과 같은 동작.
// 새 데이터는 migrate·validate를 통과한 경우에만 캐시에 저장하고 다시 연다.
import { checked, CACHE_KEY } from '../data/loader.js';
import { esc } from '../render/flatmap.js';

/**
 * @typedef {Object} UpdateOpts
 * @property {{generated?: string, version?: string, nodes?: number, edges?: number, levels?: Record<string, number>}} meta
 * @property {number} nodeCount
 * @property {number} edgeCount
 * @property {HTMLElement} top
 * @property {HTMLElement} fb
 * @property {HTMLElement} dver
 * @property {HTMLButtonElement} dupd
 * @property {HTMLElement} dmsg
 * @property {() => void} openSettings
 * @property {{setItem: (k: string, v: string) => void}} storage
 * @property {(url: string, init?: RequestInit) => Promise<Response>} fetchFn
 * @property {() => void} reload
 */

/**
 * @param {UpdateOpts} o
 * @returns {void}
 */
export function initUpdate(o) {
  const { meta: m, nodeCount, edgeCount, top, fb, dver, dupd, dmsg, openSettings, storage, fetchFn, reload } = o;

  const b = document.createElement('button');
  b.className = 'fab';
  b.id = 'fupd';
  b.textContent = '⟳';
  b.setAttribute('aria-label', '최신 데이터 받기');
  top.insertBefore(b, fb);
  b.addEventListener('click', () => {
    openSettings();
    dupd.click();
  });

  const lv = m.levels || {};
  dver.innerHTML =
    `기준 <b>${esc(m.generated || '?')}</b> · 버전 ${esc(m.version || '?')}<br>` +
    `노드 ${esc(m.nodes || nodeCount)} · 인과 ${esc(m.edges || edgeCount)} (A ${esc(lv.A || 0)} / B ${esc(lv.B || 0)} / C ${esc(lv.C || 0)} / D ${esc(lv.D || 0)})`;

  dupd.addEventListener('click', async () => {
    dupd.disabled = true;
    dmsg.textContent = '확인 중…';
    try {
      const r = await fetchFn('graph.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const x = await r.json();
      if (x.meta && m.version === x.meta.version) {
        dmsg.textContent = `이미 최신입니다 (${x.meta.generated})`;
        dupd.disabled = false;
        return;
      }
      checked(x);
      storage.setItem(CACHE_KEY, JSON.stringify(x));
      dmsg.textContent = `새 데이터 ${x.meta ? x.meta.generated : ''} 적용 중…`;
      setTimeout(() => reload(), 400);
    } catch (e) {
      dmsg.textContent = '받기 실패: ' + (e instanceof Error ? e.message : String(e)) + ' (인터넷 연결 확인)';
      dupd.disabled = false;
    }
  });
}
