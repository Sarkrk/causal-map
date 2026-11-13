// @ts-check
// 검색창과 제안 목록. 원본 q.oninput·sug.onclick과 같은 동작(상위 8개, 범주가 꺼져 있으면 켜고 선택).
import { CC, CN } from '../store/labels.js';
import { esc } from '../render/flatmap.js';

/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('../types.js').Graph} Graph */

/**
 * @param {{graph: Graph, store: Store, q: HTMLInputElement, sug: HTMLElement}} o
 * @returns {{closeSug: () => void}}
 */
export function initSearch(o) {
  const { graph, store, q, sug } = o;

  function closeSug() {
    sug.style.display = 'none';
  }

  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    if (!v) {
      closeSug();
      return;
    }
    const m = graph.nodes.filter((n) => n.name.toLowerCase().includes(v)).slice(0, 8);
    sug.innerHTML =
      m
        .map(
          (n) =>
            `<div data-id="${esc(n.id)}"><span class="dot" style="display:inline-block;background:${CC[n.cat]};margin-right:8px"></span>${esc(n.name)} <span class="sub">${CN[n.cat]}</span></div>`,
        )
        .join('') || '<div class="sub">없음</div>';
    sug.style.display = 'block';
  });

  sug.addEventListener('click', (e) => {
    const t = /** @type {Element} */ (e.target);
    const d = t.closest('[data-id]');
    if (!d) return;
    const node = graph.byId.get(/** @type {string} */ (/** @type {HTMLElement} */ (d).dataset.id));
    if (!node) return;
    q.value = '';
    closeSug();
    q.blur();
    if (!store.get().filters.cats.includes(node.cat)) store.dispatch({ type: 'toggleCat', cat: node.cat });
    store.dispatch({ type: 'select', id: node.id });
  });

  return { closeSug };
}
