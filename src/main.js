// @ts-check
// 진입점: 데이터 로드 → 그래프·저장소 생성 → 캔버스·시트·필터·검색·갱신·패널 연결.
import { loadGraph, LOAD_FAIL_MSG } from './data/loader.js';
import { createGraph } from './engine/graph.js';
import { categoriesPresent } from './store/labels.js';
import { createStore, defaultState } from './store/store.js';
import { visible } from './store/select.js';
import { createCanvas3D } from './render/canvas3d.js';
import { initSheets } from './ui/sheets.js';
import { initFilters } from './ui/filters.js';
import { initSearch, revealNode } from './ui/search.js';
import { initUpdate } from './ui/update.js';
import { initPanel } from './ui/panel.js';
import { initRoute, shareLink } from './ui/route.js';

/** @param {string} id */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  return el;
}

async function boot() {
  const stat = byId('stat');
  let loaded;
  try {
    loaded = await loadGraph();
  } catch {
    stat.textContent = LOAD_FAIL_MSG;
    return;
  }
  const data = loaded.data;
  const graph = createGraph(data);
  const store = createStore(defaultState(categoriesPresent(graph)), { nodeIds: graph.nodes.map((n) => n.id) });

  const search = initSearch({
    graph,
    store,
    q: /** @type {HTMLInputElement} */ (byId('q')),
    sug: byId('sug'),
  });

  const cv = /** @type {HTMLCanvasElement} */ (byId('cv'));
  // version: 배치 저장('cg_layout')은 데이터 버전이 같을 때만 쓴다.
  const canvas = createCanvas3D(cv, graph, store, {
    onPointerDown: () => search.closeSug(),
    version: String(data.meta?.version ?? ''),
  });

  const sheets = initSheets(
    {
      ns: byId('ns'),
      fs: byId('fs'),
      nsh: byId('nsh'),
      fsh: byId('fsh'),
      fb: byId('fb'),
      zoombox: byId('zoombox'),
    },
    { onDeselect: () => store.dispatch({ type: 'deselect' }) },
  );
  store.subscribe(sheets.onStore);

  initFilters({
    graph,
    store,
    categories: categoriesPresent(graph),
    flv: byId('flv'),
    fcat: byId('fcat'),
    thrEl: /** @type {HTMLInputElement} */ (byId('thr')),
    thrv: byId('thrv'),
    reset: byId('freset'),
    badge: byId('fbadge'),
    toggles: {
      tweak: byId('tweak'),
      tnr: byId('tnr'),
      tcor: byId('tcor'),
      tlab: byId('tlab'),
      torp: byId('torp'),
      tspin: byId('tspin'),
      twob: byId('twob'),
    },
  });
  byId('trel').addEventListener('click', () => canvas.reseed());

  byId('zi').addEventListener('click', () => canvas.zoomBy(1.35));
  byId('zo').addEventListener('click', () => canvas.zoomBy(1 / 1.35));
  byId('zf').addEventListener('click', () => canvas.fit(true));
  byId('zc').addEventListener('click', () => canvas.recenter());

  stat.textContent = '';

  initUpdate({
    meta: data.meta || {},
    dupd: /** @type {HTMLButtonElement} */ (byId('dupd')),
    dmsg: byId('dmsg'),
    storage: globalThis.localStorage,
    fetchFn: (url, init) => globalThis.fetch(url, init),
    reload: () => location.reload(),
  });

  initPanel({
    graph,
    store,
    nt: byId('nt'),
    nsub: byId('nsub'),
    nb: byId('nb'),
  });

  // 주소(#n=…) 열기·뒤로 가기. 노드 열기는 점 탭과 같은 select 흐름(카메라 이동·시트 열기)을 쓴다.
  initRoute({
    graph,
    store,
    onOpenNode: (id) => {
      const node = graph.byId.get(id);
      if (node) revealNode(graph, store, node);
      store.dispatch({ type: 'select', id });
    },
  });

  byId('nclose').addEventListener('pointerdown', (e) => e.stopPropagation());
  byId('nclose').addEventListener('click', () => store.dispatch({ type: 'deselect' }));

  // 첫 방문 한 줄 힌트(한 번만). 노드를 열면 사라진다.
  store.subscribe((_st, _prev, a) => {
    if (a.type === 'select') byId('toast').classList.remove('on');
  });
  try {
    if (!localStorage.getItem('cg_hint')) {
      localStorage.setItem('cg_hint', '1');
      toast('점을 탭하면 원인과 결과가 보여요', 4000);
    }
  } catch {
    /* 저장소 접근 불가면 힌트 생략 */
  }

  // 노드 시트의 '링크' 버튼. 시트 드래그(pointerdown·capture)와 겹치지 않게 pointerdown을 막는다.
  const shareBtn = byId('nshare');
  shareBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  shareBtn.addEventListener('click', () => {
    const v = store.get().view;
    const node = v.selected ? graph.byId.get(v.selected) : undefined;
    if (node) shareLink(v, node.name, { notify: toast }).catch(() => {});
  });
}

let toastTimer = 0;
/** @param {string} msg @param {number} [ms] */
function toast(msg, ms = 1600) {
  const el = byId('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('on'), ms);
}

boot();
