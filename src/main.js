// @ts-check
// 진입점: 데이터 로드 → 그래프·저장소 생성 → 캔버스·시트·필터·검색·갱신·패널 연결.
import { loadGraph, LOAD_FAIL_MSG } from './data/loader.js';
import { createGraph } from './engine/graph.js';
import { categoriesPresent } from './store/labels.js';
import { createStore, initialState } from './store/store.js';
import { visible } from './store/select.js';
import { createCanvas3D } from './render/canvas3d.js';
import { initSheets } from './ui/sheets.js';
import { initFilters } from './ui/filters.js';
import { initSearch } from './ui/search.js';
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
  const store = createStore(initialState(categoriesPresent(graph)));

  const search = initSearch({
    graph,
    store,
    q: /** @type {HTMLInputElement} */ (byId('q')),
    sug: byId('sug'),
  });

  const cv = /** @type {HTMLCanvasElement} */ (byId('cv'));
  const canvas = createCanvas3D(cv, graph, store, { onPointerDown: () => search.closeSug() });

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
    toggles: {
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

  /** @param {import('./store/store.js').AppState} st */
  const updateStat = (st) => {
    const v = visible(graph, st);
    stat.textContent = `노드 ${v.nodes.size} · 인과 ${v.causal.length}${st.filters.showCor ? ' · 상관 ' + v.cors.length : ''}`;
  };
  updateStat(store.get());
  store.subscribe((st) => updateStat(st));

  initUpdate({
    meta: data.meta || {},
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    top: byId('top'),
    fb: byId('fb'),
    dver: byId('dver'),
    dupd: /** @type {HTMLButtonElement} */ (byId('dupd')),
    dmsg: byId('dmsg'),
    openSettings: () => sheets.setSheet(byId('fs'), 'open'),
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
      if (node && !store.get().filters.cats.includes(node.cat)) store.dispatch({ type: 'toggleCat', cat: node.cat });
      store.dispatch({ type: 'select', id });
    },
  });

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
/** @param {string} msg */
function toast(msg) {
  const el = byId('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('on'), 1600);
}

boot();
