// @ts-check
// 진입점: 데이터 로드 → 그래프·저장소 생성 → 캔버스·시트·필터·검색·갱신·패널 연결.
import { loadGraph, LOAD_FAIL_MSG } from './data/loader.js';
import { createGraph } from './engine/graph.js';
import { sectorsPresent } from './store/labels.js';
import { createStore, defaultState } from './store/store.js';
import { visible } from './store/select.js';
import { createCanvas3D } from './render/canvas3d.js';
import { initSheets } from './ui/sheets.js';
import { initFilters } from './ui/filters.js';
import { initSearch, revealNode } from './ui/search.js';
import { initUpdate } from './ui/update.js';
import { initPanel } from './ui/panel.js';
import { initRoute, shareLink } from './ui/route.js';
import { initDataInfo } from './ui/datainfo.js';
import { initIndustry } from './ui/industry.js';
import { initFocus2D, pickInitialNode } from './ui/focus2d.js';

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
  const store = createStore(defaultState(sectorsPresent(graph)), { nodeIds: graph.nodes.map((n) => n.id) });

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

  // 기본 보기: 2D 포커스 흐름 맵 (상단 3D 버튼으로 언제든 3D 구형 그래프 전환)
  let is3d = false;
  const f2dEl = document.getElementById('f2d');
  const mode3dBtn = document.getElementById('mode3d');

  const sheets = initSheets(
    {
      ns: byId('ns'),
      fs: byId('fs'),
      nsh: byId('nsh'),
      fsh: byId('fsh'),
      fb: byId('fb'),
      zoombox: byId('zoombox'),
    },
    {
      onDeselect: () => {
        if (is3d) store.dispatch({ type: 'deselect' });
      },
      autoOpenOnSelect: () => is3d,
    },
  );
  store.subscribe(sheets.onStore);

  /** @param {boolean} on3d */
  function set3DMode(on3d) {
    is3d = on3d;
    document.body.classList.toggle('mode-3d', on3d);
    if (mode3dBtn) {
      mode3dBtn.textContent = on3d ? '2D' : '3D';
      mode3dBtn.classList.toggle('on', on3d);
      mode3dBtn.setAttribute('aria-label', on3d ? '2D 흐름 지도로 돌아가기' : '3D 그래프로 전환');
    }
    if (focus2d) focus2d.setActive(!on3d);
    if (on3d) {
      byId('toast').classList.remove('on');
      if (store.get().view.selected) sheets.setSheet(byId('ns'), 'half');
    } else {
      sheets.setSheet(byId('ns'), '');
    }
  }

  const focus2d = f2dEl
    ? initFocus2D({
        root: f2dEl,
        graph,
        store,
        meta: data.meta || {},
        onSelectNode: (id) => {
          const node = graph.byId.get(id);
          if (node) revealNode(graph, store, node);
          store.dispatch({ type: 'select', id });
        },
        onOpenDetail: (tab) => {
          store.dispatch({ type: 'setTab', tab });
          sheets.setSheet(byId('ns'), 'open');
        },
        onShare: () => {
          const v = store.get().view;
          const node = v.selected ? graph.byId.get(v.selected) : undefined;
          if (node) shareLink(v, node.name, { notify: toast }).catch(() => {});
        },
      })
    : null;

  if (mode3dBtn && f2dEl) {
    mode3dBtn.addEventListener('click', () => set3DMode(!is3d));
  }

  initFilters({
    graph,
    store,
    sectors: sectorsPresent(graph),
    flv: byId('flv'),
    fsec: byId('fsec'),
    ftier: document.getElementById('ftier'),
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
      tstate: document.getElementById('tstate'),
    },
  });
  byId('trel').addEventListener('click', () => canvas.reseed());

  byId('zi').addEventListener('click', () => canvas.zoomBy(1.35));
  byId('zo').addEventListener('click', () => canvas.zoomBy(1 / 1.35));
  byId('zf').addEventListener('click', () => canvas.fit(true));
  byId('zc').addEventListener('click', () => canvas.recenter());

  // 산업 지도(반도체 밸류체인) 토글 — 11/23
  // 옛 HTML 캐시 + 새 JS 혼합 시 요소가 없을 수 있다 → 앱 전체가 죽지 않게 방어(11/23)
  const indBtn = document.getElementById('indbtn');
  if (indBtn && document.getElementById('indview')) {
    const industry = initIndustry({
      revealNode: (name) => {
        const node = graph.nodes.find((n) => n.id === name || n.name === name);
        if (!node) return;
        revealNode(graph, store, node);
        store.dispatch({ type: 'select', id: node.id });
      },
      onMode: () => {},
    });
    indBtn.addEventListener('click', () => industry.toggle());
  }

  // 왼쪽 아래 상태줄: 데이터 규모 + 활성 국면(v3)을 한 줄로 보여준다.
  const mr = data.meta?.marketRegime;
  const regPart = mr && mr.label ? ` · ${mr.label}` : '';
  stat.textContent = `노드 ${graph.nodes.length.toLocaleString('ko-KR')} · 관계선 ${graph.edges.length.toLocaleString('ko-KR')}${regPart}`;

  initUpdate({
    meta: data.meta || {},
    dupd: /** @type {HTMLButtonElement} */ (byId('dupd')),
    dmsg: byId('dmsg'),
    storage: globalThis.localStorage,
    fetchFn: (url, init) => globalThis.fetch(url, init),
    reload: () => location.reload(),
  });

  // 보기 설정 시트 맨 위의 '데이터 정보'(노드·관계선 개수, 등급 분포, 갱신일).
  initDataInfo(document.getElementById('fstat'), { graph, meta: data.meta || {} });

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
  byId('nclose').addEventListener('click', () => {
    sheets.setSheet(byId('ns'), '');
    if (is3d) store.dispatch({ type: 'deselect' });
  });

  // 초기 진입: 2D 포커스 맵 기본 활성화(딥링크로 노드가 이미 열려 있지 않으면 대표 노드 포커스)
  if (f2dEl) {
    if (!store.get().view.selected) {
      const initId = pickInitialNode(graph);
      if (initId) store.dispatch({ type: 'select', id: initId });
    } else if (['sim', 'path', 'loop'].includes(store.get().view.tab)) {
      sheets.setSheet(byId('ns'), 'open');
    }
    set3DMode(false);
  } else {
    document.body.classList.add('mode-3d');
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
