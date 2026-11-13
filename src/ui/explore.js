// @ts-check
// 노드 패널의 '루프'·'경로' 탭: 엔진 호출(메모이즈)·HTML 생성·클릭 해석.
// DOM 접근 없음(문자열과 순수 함수만). 계산은 항상 engine/cycles.js·engine/paths.js를 쓴다.
// 계산 필터는 현재 가시 인과 엣지(causalVisible)만 쓴다.
import { findLoops as engineFindLoops } from '../engine/cycles.js';
import { findPaths as engineFindPaths } from '../engine/paths.js';
import { SIGN_LABEL } from '../engine/graph.js';
import { causalVisible } from '../store/select.js';
import { esc } from '../render/flatmap.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').Loop} Loop */
/** @typedef {import('../types.js').Path} Path */
/** @typedef {import('../store/store.js').AppState} AppState */
/** @typedef {import('../store/store.js').Trace} Trace */

export const LOOP_MAX_LEN = 4;
export const LOOP_LIMIT = 30;
export const PATH_MAX_LEN = 4;
export const PATH_K = 10;
export const SUGGEST_MAX = 8;

/** 극성 → 배지 문구·색 */
const POLARITY = {
  R: { text: 'R 강화', color: '#f7768e' },
  B: { text: 'B 균형', color: '#7aa2f7' },
  '?': { text: '? 조건부', color: '#9a9a9a' },
};

/** 부호 → 배지 색 */
const SIGN_COLOR = { '+': '#9ece6a', '-': '#f7768e', '±': '#9a9a9a' };

const LOOP_HEAD =
  '강화 루프(R)는 변화를 키우고, 균형 루프(B)는 되돌린다. 항목을 누르면 지도에 표시.';

/**
 * 엔진 함수를 주입할 수 있는 탐색기. 같은 (graph, filters, sel, maxLen) 키는 엔진을 한 번만 부른다.
 * 테스트는 engines에 카운터를 넣어 메모이즈를 확인한다.
 * @param {{findLoops?: typeof engineFindLoops, findPaths?: typeof engineFindPaths}} [engines]
 */
export function createExplore(engines = {}) {
  const findLoops = engines.findLoops ?? engineFindLoops;
  const findPaths = engines.findPaths ?? engineFindPaths;
  /** @type {WeakMap<Graph, Map<string, unknown>>} */
  const memo = new WeakMap();
  const MAX_ENTRIES = 60;

  /**
   * @template T
   * @param {Graph} g
   * @param {string} key
   * @param {() => T} calc
   * @returns {T}
   */
  function cached(g, key, calc) {
    let m = memo.get(g);
    if (!m) {
      m = new Map();
      memo.set(g, m);
    }
    if (m.has(key)) return /** @type {T} */ (m.get(key));
    const v = calc();
    m.set(key, v);
    if (m.size > MAX_ENTRIES) m.delete(/** @type {string} */ (m.keys().next().value));
    return v;
  }

  /** @param {AppState} st */
  const filterKey = (st) => JSON.stringify(st.filters);

  return {
    /**
     * 선택 노드를 지나는 루프(상위 LOOP_LIMIT개). 선택이 없으면 [].
     * @param {Graph} g
     * @param {AppState} st
     * @returns {Loop[]}
     */
    loops(g, st) {
      const sel = st.view.selected;
      if (!sel) return [];
      return cached(g, `L|${filterKey(st)}|${sel}|${LOOP_MAX_LEN}`, () =>
        findLoops(g, sel, {
          maxLen: LOOP_MAX_LEN,
          limit: LOOP_LIMIT,
          filter: (e) => causalVisible(g, e, st.filters),
        }),
      );
    },
    /**
     * 선택 노드 → 도착 노드(pathTo) 경로. 방향 반전 상태를 반영한다.
     * 도착 노드가 없으면 null.
     * @param {Graph} g
     * @param {AppState} st
     * @returns {{from: string, to: string, items: Path[]}|null}
     */
    paths(g, st) {
      const sel = st.view.selected;
      const pathTo = st.view.pathTo;
      if (!sel || !pathTo) return null;
      const rev = isReversed(sel, pathTo);
      const from = rev ? pathTo : sel;
      const to = rev ? sel : pathTo;
      const items = cached(g, `P|${filterKey(st)}|${from}|${to}|${PATH_MAX_LEN}`, () =>
        findPaths(g, from, to, {
          maxLen: PATH_MAX_LEN,
          k: PATH_K,
          filter: (e) => causalVisible(g, e, st.filters),
        }),
      );
      return { from, to, items };
    },
  };
}

const defaultExplore = createExplore();

/**
 * @param {Graph} g
 * @param {AppState} st
 * @returns {Loop[]}
 */
export function loopItems(g, st) {
  return defaultExplore.loops(g, st);
}

/**
 * @param {Graph} g
 * @param {AppState} st
 * @returns {{from: string, to: string, items: Path[]}|null}
 */
export function pathItems(g, st) {
  return defaultExplore.paths(g, st);
}

/* ---------- 방향 반전 상태 (모듈 지역) ----------
 * 선택 노드·도착 노드 쌍이 바뀌면 자동으로 정방향으로 돌아간다.
 * 패널은 렌더마다 isReversed를 한 번 불러 쌍 변경을 반영한다. */
/** @type {{sel: string|null, to: string|null, rev: boolean}} */
let dirState = { sel: null, to: null, rev: false };

/**
 * 현재 쌍에서 반전 여부. 쌍이 바뀌었으면 정방향으로 초기화한다.
 * @param {string|null} sel
 * @param {string|null} to
 * @returns {boolean}
 */
export function isReversed(sel, to) {
  if (dirState.sel !== sel || dirState.to !== to) dirState = { sel, to, rev: false };
  return dirState.rev;
}

/**
 * '⇄ 반대로' 토글.
 * @param {string|null} sel
 * @param {string|null} to
 */
export function toggleReverse(sel, to) {
  dirState = { sel, to, rev: !isReversed(sel, to) };
}

/* ---------- trace ---------- */

/**
 * 루프·경로 항목 → Trace.
 * @param {'loop'|'path'} kind
 * @param {{nodes: string[], edges: EdgeData[]}} it
 * @returns {Trace}
 */
export function traceOf(kind, it) {
  return { kind, nodes: it.nodes.slice(), edges: it.edges.map((e) => e.id) };
}

/**
 * 두 trace가 같은 항목인지(종류 + 엣지 id 순서). null끼리는 false.
 * @param {Trace|null} a
 * @param {Trace|null} b
 * @returns {boolean}
 */
export function sameTrace(a, b) {
  if (!a || !b) return false;
  return a.kind === b.kind && a.edges.join('\u0001') === b.edges.join('\u0001');
}

/**
 * 항목 탭(data-kind, data-idx)을 Trace로 해석한다. 목록은 메모이즈된 것을 쓰므로 화면과 같다.
 * @param {Graph} g
 * @param {AppState} st
 * @param {string|null} kind
 * @param {number} idx
 * @returns {Trace|null}
 */
export function traceAt(g, st, kind, idx) {
  if (!Number.isInteger(idx) || idx < 0) return null;
  if (kind === 'loop') {
    const it = loopItems(g, st)[idx];
    return it ? traceOf('loop', it) : null;
  }
  if (kind === 'path') {
    const it = pathItems(g, st)?.items[idx];
    return it ? traceOf('path', it) : null;
  }
  return null;
}

/* ---------- HTML ---------- */

/**
 * 연쇄 표기: 'A →(+) B →(−) C →(+) A'. edges는 이어진 순서.
 * @param {Graph} g
 * @param {EdgeData[]} edges
 * @returns {string}
 */
function chainHtml(g, edges) {
  /** @param {string} id */
  const nm = (id) => esc(g.byId.get(id)?.name ?? id);
  if (edges.length === 0) return '';
  let s = nm(edges[0].src);
  for (const e of edges) s += ` →(${esc(SIGN_LABEL[e.sign] ?? e.sign)}) ${nm(e.dst)}`;
  return s;
}

/**
 * @param {EdgeData[]} edges
 * @returns {string}
 */
const gradeText = (edges) => edges.map((e) => esc(e.level)).join('·');

/**
 * 항목 한 줄 공통 래퍼. 선택된 항목은 .on + 배경.
 * @param {boolean} on
 * @param {string} attrs
 * @param {string} inner
 */
function itemBox(on, attrs, inner) {
  const style = `cursor:pointer;${on ? 'background:#2e2e2e;border-radius:8px;' : ''}`;
  return `<div class="it${on ? ' on' : ''}" data-act="trace" ${attrs} style="${style}">${inner}</div>`;
}

/**
 * @param {Graph} g
 * @param {Loop} l
 * @param {number} i
 * @param {Trace|null} active
 */
function loopItemHtml(g, l, i, active) {
  const p = POLARITY[l.polarity];
  const on = sameTrace(active, traceOf('loop', l));
  return itemBox(
    on,
    `data-kind="loop" data-idx="${i}"`,
    `<div class="r1" style="flex-wrap:wrap"><span class="g" style="background:${p.color}33;color:${p.color}">${p.text}</span>` +
      `<span class="nm" style="font-size:14px;line-height:1.5">${chainHtml(g, l.edges)}</span></div>` +
      `<div class="meta">등급 ${gradeText(l.edges)} · 길이 ${l.edges.length}</div>`,
  );
}

/**
 * @param {Graph} g
 * @param {Path} p
 * @param {number} i
 * @param {Trace|null} active
 */
function pathItemHtml(g, p, i, active) {
  const on = sameTrace(active, traceOf('path', p));
  const col = SIGN_COLOR[p.sign] ?? SIGN_COLOR['±'];
  return itemBox(
    on,
    `data-kind="path" data-idx="${i}"`,
    `<div class="r1" style="flex-wrap:wrap"><span class="g" style="background:${col}33;color:${col}">순효과 ${esc(SIGN_LABEL[p.sign] ?? p.sign)}</span>` +
      `<span class="nm" style="font-size:14px;line-height:1.5">${chainHtml(g, p.edges)}</span></div>` +
      `<div class="meta">등급 ${gradeText(p.edges)} · 길이 ${p.edges.length}</div>`,
  );
}

/**
 * 루프 탭 HTML.
 * @param {Graph} g
 * @param {AppState} st
 * @returns {string}
 */
export function loopTabHtml(g, st) {
  const items = loopItems(g, st);
  const head = `<p class="sub" style="margin-top:6px;line-height:1.5">${LOOP_HEAD}</p>`;
  if (items.length === 0) return head + '<p class="sub">이 노드를 지나는 4단계 이하 루프 없음(현재 필터 기준)</p>';
  return head + items.map((l, i) => loopItemHtml(g, l, i, st.view.trace)).join('');
}

/**
 * 경로 탭 전체 틀(입력창 + 제안 + 결과). 입력창은 한 번 만들어지면 패널이 유지한다.
 * @param {Graph} g
 * @param {AppState} st
 * @returns {string}
 */
export function pathBoxHtml(g, st) {
  const sel = st.view.selected ?? '';
  return (
    `<div id="pbox" data-sel="${esc(sel)}">` +
    `<input id="pq" type="search" placeholder="도착 노드 검색" autocomplete="off" style="width:100%;height:40px;border-radius:20px;border:1px solid var(--line);background:#2e2e2e;color:var(--tx);padding:0 14px;font-size:16px;outline:none">` +
    `<div id="psug" class="row" style="margin-top:6px"></div>` +
    `<div data-part="plist">${pathListHtml(g, st)}</div>` +
    `</div>`
  );
}

/**
 * 경로 결과 부분(입력창·제안 제외). 재렌더 때 이것만 바꾼다.
 * @param {Graph} g
 * @param {AppState} st
 * @returns {string}
 */
export function pathListHtml(g, st) {
  const pv = pathItems(g, st);
  if (!pv) {
    return '<p class="sub" style="margin-top:10px">위 칸에 도착 노드 이름을 입력해 고르면, 선택 노드와 그 노드 사이의 4단계 이하 경로를 보여줍니다.</p>';
  }
  /** @param {string} id */
  const nm = (id) => esc(g.byId.get(id)?.name ?? id);
  const head =
    `<div class="r1" style="margin-top:10px;font-size:14px;flex-wrap:wrap">` +
    `<span class="nm">${nm(pv.from)} → ${nm(pv.to)}</span>` +
    `<button class="chip" data-act="pathrev">⇄ 반대로</button></div>`;
  if (pv.items.length === 0) {
    return head + '<p class="sub">4단계 이하 경로 없음(현재 필터 기준)</p>';
  }
  return (
    head +
    `<div class="sub">상위 ${pv.items.length}개 · 짧은 순 → 등급 합 순</div>` +
    pv.items.map((p, i) => pathItemHtml(g, p, i, st.view.trace)).join('')
  );
}

/**
 * 도착 노드 제안(부분 일치, 선택 노드 제외, 최대 SUGGEST_MAX개). 빈 입력이면 ''.
 * @param {Graph} g
 * @param {string} query
 * @param {string|null} sel
 * @returns {string}
 */
export function suggestHtml(g, query, sel) {
  const v = query.trim().toLowerCase();
  if (!v) return '';
  const m = g.nodes.filter((n) => n.id !== sel && n.name.toLowerCase().includes(v)).slice(0, SUGGEST_MAX);
  if (m.length === 0) return '<span class="sub">없음</span>';
  return m
    .map((n) => `<button class="chip" data-act="pathto" data-id="${esc(n.id)}">${esc(n.name)}</button>`)
    .join('');
}
