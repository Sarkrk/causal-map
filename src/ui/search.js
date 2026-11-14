// @ts-check
// 검색창과 제안 목록. 원본 q.oninput·sug.onclick과 같은 동작(상위 8개, 범주가 꺼져 있으면 켜고 선택).
import { CC, CN } from '../store/labels.js';
import { esc } from '../render/flatmap.js';
import { searchNodes } from '../engine/graph.js';
import { causalVisible } from '../store/select.js';
import { LEVELS } from '../store/labels.js';

/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('../types.js').Graph} Graph */

/**
 * 노드를 열기 전에, 그 노드가 속한 범주를 켜고, 보이는 연결이 하나도 없으면 약한(B-)·후보·논쟁 연결도 켠다.
 * @param {Graph} graph
 * @param {Store} store
 * @param {import('../types.js').NodeData} node
 * @returns {void}
 */
export function revealNode(graph, store, node) {
  if (!store.get().filters.cats.includes(node.cat)) store.dispatch({ type: 'toggleCat', cat: node.cat });
  const mine = graph.edges.filter((e) => e.src === node.id || e.dst === node.id);
  if (mine.length === 0 || mine.some((e) => causalVisible(graph, e, store.get().filters))) return;
  if (!store.get().filters.weak) store.dispatch({ type: 'toggle', key: 'weak' });
  for (const lv of LEVELS) {
    if (!store.get().filters.levels.includes(lv) && mine.some((e) => e.level === lv)) store.dispatch({ type: 'toggleLevel', level: lv });
  }
}

/**
 * @param {{graph: Graph, store: Store, q: HTMLInputElement, sug: HTMLElement}} o
 * @returns {{closeSug: () => void}}
 */
export function initSearch(o) {
  const { graph, store, q, sug } = o;

  function closeSug() {
    sug.style.display = 'none';
  }

  function showSug() {
    const v = q.value.trim().toLowerCase();
    if (!v) {
      closeSug();
      return;
    }
    const m = searchNodes(graph.nodes, v).slice(0, 8);
    sug.innerHTML =
      m
        .map(
          (n) =>
            `<div data-id="${esc(n.id)}"><span class="dot" style="background:${CC[n.cat]}"></span>${esc(n.name)} <span class="sub" style="margin:0 0 0 auto">${CN[n.cat]}</span></div>`,
        )
        .join('') || '<div class="sub">검색 결과 없음</div>';
    sug.style.display = 'block';
  }

  q.addEventListener('input', () => {
    store.dispatch({ type: 'setSearch', value: q.value });
    showSug();
  });

  // 저장된 검색어를 입력창에 되돌린다(제안 목록은 입력할 때 연다).
  q.value = store.get().view.search;

  /** @param {string|undefined} id */
  function pick(id) {
    const node = id ? graph.byId.get(id) : undefined;
    if (!node) return;
    q.value = '';
    store.dispatch({ type: 'setSearch', value: '' });
    closeSug();
    q.blur();
    revealNode(graph, store, node);
    store.dispatch({ type: 'select', id: node.id });
  }

  sug.addEventListener('click', (e) => {
    const d = /** @type {Element} */ (e.target).closest('[data-id]');
    if (d) pick(/** @type {HTMLElement} */ (d).dataset.id);
  });
  // 엔터: 첫 번째 제안을 연다
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') pick(sug.querySelector('[data-id]')?.getAttribute('data-id') ?? undefined);
  });

  return { closeSug };
}
