// @ts-check
// 노드 상세 시트: 헤더·탭·항목 목록·관계도. 원본 render()·item()·cri()와 같은 문구.
// 클릭은 이벤트 위임(data-act/data-id). inline onclick은 쓰지 않는다.
import { GC, CC, CN, DIR_BTN, DIR_TEXT } from '../store/labels.js';
import { causalVisible } from '../store/select.js';
import { SIGN_LABEL } from '../engine/graph.js';
import { esc, flatHtml } from '../render/flatmap.js';

/** @typedef {import('../store/store.js').AppState} AppState */
/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').CorData} CorData */
/** @typedef {import('../types.js').NodeData} NodeData */

/**
 * @param {{graph: Graph, store: Store, nt: HTMLElement, nsub: HTMLElement, nb: HTMLElement}} o
 * @returns {void}
 */
export function initPanel(o) {
  const { graph, store, nt, nsub, nb } = o;

  /** @param {string} id @returns {NodeData} */
  const nodeOf = (id) => {
    const x = graph.byId.get(id);
    if (!x) throw new Error('unknown node ' + id);
    return x;
  };

  /** @param {EdgeData[]} a */
  const ord = (a) => a.slice().sort((x, y) => x.level.localeCompare(y.level) || Math.abs(y.r || 0) - Math.abs(x.r || 0));

  /** @param {EdgeData} l */
  const evText = (l) =>
    l.evidence && l.evidence.length ? '근거: ' + esc(l.evidence.map((x) => x.kind + '·' + x.stance).join(', ')) + '<br>' : '';

  /**
   * @param {AppState} st
   * @param {EdgeData} l
   * @param {NodeData} other
   * @param {string} dir
   */
  const item = (st, l, other, dir) =>
    `<div class="it"><div class="r1"><span class="g" style="background:${GC[l.level]}33;color:${l.level === 'C' ? '#bbb' : GC[l.level]}">${esc(l.level)}</span>` +
    `<span class="sg">${esc(SIGN_LABEL[l.sign] ?? l.sign)}</span><span class="nm">${dir} ${esc(other.name)}</span>` +
    `<a class="go" data-act="go" data-id="${esc(other.id)}">이동 ›</a></div>` +
    `<div class="meta">${esc(l.id)}${l.r != null ? ` · r=${l.r}` : ''}${l.status && l.status !== 'open' ? ' · ' + esc(l.status) : ''}${causalVisible(graph, l, st.filters) ? '' : ' · 숨김'}</div>` +
    `<div class="note">${evText(l)}${esc(l.note || '메모 없음')}</div></div>`;

  /** @param {CorData} l @param {string} selId */
  const cri = (l, selId) => {
    const o2 = nodeOf(l.src === selId ? l.dst : l.src);
    return (
      `<div class="it"><div class="r1"><span class="g" style="background:#3fb6c933;color:#3fb6c9">상관</span>` +
      `<span class="nm">${esc(o2.name)}</span><a class="go" data-act="go" data-id="${esc(o2.id)}">이동 ›</a></div>` +
      `<div class="meta">r=${l.r} · n=${esc(l.n || '')} · 인과 아님</div></div>`
    );
  };

  /** @param {AppState} st */
  function render(st) {
    const sel = st.view.selected;
    if (!sel) return;
    const n = nodeOf(sel);
    const { hop, dir, tab } = st.view;
    const inn = graph.edges.filter((l) => l.dst === n.id);
    const out = graph.edges.filter((l) => l.src === n.id);
    const cr = graph.cors.filter((c) => c.src === n.id || c.dst === n.id);

    nt.innerHTML = `<span class="dot" style="background:${CC[n.cat]}"></span>${esc(n.name)}`;
    nsub.textContent = `${CN[n.cat]} · 원인 ${inn.length} · 결과 ${out.length} · 상관 ${cr.length} · 강조 ${hop}단계 · ${DIR_TEXT[dir]}`;

    /** @type {Record<'map'|'in'|'out'|'cor', [string, string]>} */
    const T = {
      map: ['관계도', flatHtml(graph, st, n.id)],
      in: ['← 원인', ord(inn).map((l) => item(st, l, nodeOf(l.src), '←')).join('')],
      out: ['결과 →', ord(out).map((l) => item(st, l, nodeOf(l.dst), '→')).join('')],
      cor: ['상관', cr.map((c) => cri(c, n.id)).join('')],
    };
    const tabs = /** @type {('map'|'in'|'out'|'cor')[]} */ (['map', 'in', 'out', 'cor']).map((k) => {
      const cnt = k === 'map' ? '' : ' ' + (k === 'in' ? inn.length : k === 'out' ? out.length : cr.length);
      return `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${T[k][0]}${cnt}</button>`;
    });
    nb.innerHTML =
      `<div class="tabs">${tabs.join('')}</div>` +
      `<div class="tabs" style="margin-top:0;justify-content:flex-end"><button data-act="hop">${hop}단계 ⇄</button>` +
      `<button data-act="dir">${DIR_BTN[dir]}</button></div>${T[tab][1] || '<p class="sub">없음</p>'}`;
    const fl = nb.querySelector('.fl');
    if (fl && fl.scrollWidth > fl.clientWidth) fl.scrollLeft = (fl.scrollWidth - fl.clientWidth) / 2;
  }

  nb.addEventListener('click', (e) => {
    const t = /** @type {Element} */ (e.target);
    const a = t.closest('[data-act]');
    if (a) {
      const act = a.getAttribute('data-act');
      const st = store.get();
      if (act === 'go') {
        const id = a.getAttribute('data-id');
        if (id) store.dispatch({ type: 'select', id });
      } else if (act === 'tab') {
        const tab = /** @type {'map'|'in'|'out'|'cor'} */ (a.getAttribute('data-tab'));
        store.dispatch({ type: 'setTab', tab });
      } else if (act === 'hop') {
        store.dispatch({ type: 'setHop', hop: st.view.hop === 1 ? 2 : 1 });
      } else if (act === 'dir') {
        const next = st.view.dir === 'both' ? 'up' : st.view.dir === 'up' ? 'down' : 'both';
        store.dispatch({ type: 'setDir', dir: next });
      } else if (act === 'flatall') {
        store.dispatch({ type: 'toggleFlatAll' });
      }
      return;
    }
    const it = t.closest('.it');
    if (it) it.classList.toggle('x');
  });

  store.subscribe((st) => render(st));
  render(store.get());
}
