// @ts-check
// 가시성 선택자와 강조 이웃 계산. canvas와 패널이 같은 함수를 쓴다. 전부 순수 함수.
import { neighborhood } from '../engine/traverse.js';
import { SECTOR_ORDER } from './labels.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').CorData} CorData */
/** @typedef {import('./store.js').AppState} AppState */
/** @typedef {import('./store.js').Filters} Filters */

/**
 * 엣지 양 끝 노드가 모두 켜진 섹터·티어에 속하는지. 섹터가 없는 노드는 'other', 티어가 없는 노드는 'core'.
 * @param {Graph} g
 * @param {string} src
 * @param {string} dst
 * @param {Filters} f
 * @returns {boolean}
 */
function sectorsOk(g, src, dst, f) {
  const a = g.byId.get(src);
  const b = g.byId.get(dst);
  if (!a || !b) return false;
  if (!f.sectors.includes(a.sector || 'other') || !f.sectors.includes(b.sector || 'other')) return false;
  if (Array.isArray(f.tiers)) {
    if (!f.tiers.includes(a.tier || 'core') || !f.tiers.includes(b.tier || 'core')) return false;
  }
  return true;
}

/**
 * 엣지의 등급·약한근거·상관계수 문턱 통과 여부(섹터와 무관).
 * @param {EdgeData} e
 * @param {Filters} f
 * @returns {boolean}
 */
function edgePasses(e, f) {
  if (!f.levels.includes(e.level)) return false;
  if (!f.weak && e.level === 'B' && e.sub === '-') return false;
  return e.r == null ? f.showNR : Math.abs(e.r) >= f.thr;
}

/**
 * 인과 엣지 표시 여부 (원본 lvis, k==='c').
 * @param {Graph} g
 * @param {EdgeData} e
 * @param {Filters} f
 * @returns {boolean}
 */
export function causalVisible(g, e, f) {
  return edgePasses(e, f) && sectorsOk(g, e.src, e.dst, f);
}

/**
 * 상관선 표시 여부 (원본 lvis, k==='r'). thr은 적용하지 않는다(원본과 같음).
 * @param {Graph} g
 * @param {CorData} c
 * @param {Filters} f
 * @returns {boolean}
 */
export function corVisible(g, c, f) {
  return f.showCor && sectorsOk(g, c.src, c.dst, f);
}

/**
 * 가시성 전체 계산 (원본 recompute). 노드 = 섹터 켜짐 && (고립 숨김 끔 || 가시 엣지 끝점 || 선택 노드).
 * 노드는 g.nodes 순서로 담긴다(원본 VN 순서와 같음).
 * @param {Graph} g
 * @param {AppState} state
 * @param {string|null} [sel=state.view.selected]
 * @returns {{nodes: Set<string>, causal: EdgeData[], cors: CorData[]}}
 */
export function visible(g, state, sel = state.view.selected) {
  const f = state.filters;
  const causal = g.edges.filter((e) => causalVisible(g, e, f));
  const cors = g.cors.filter((c) => corVisible(g, c, f));
  /** @type {Set<string>} */
  const has = new Set();
  for (const e of causal) {
    has.add(e.src);
    has.add(e.dst);
  }
  for (const c of cors) {
    has.add(c.src);
    has.add(c.dst);
  }
  // 고립 판정은 섹터 필터를 무시한 연결성으로 한다(섹터 단독 보기에서 교차 엣지만 가진 노드가
  // 전부 고립으로 사라지는 것 방지). 등급 필터는 그대로 적용.
  if (f.sectors.length < SECTOR_ORDER.length) {
    for (const e of g.edges) {
      if (!edgePasses(e, f)) continue;
      has.add(e.src);
      has.add(e.dst);
    }
    if (f.showCor) {
      for (const c of g.cors) {
        has.add(c.src);
        has.add(c.dst);
      }
    }
  }
  /** @type {Set<string>} */
  const nodes = new Set();
  for (const n of g.nodes) {
    if (!f.sectors.includes(n.sector || 'other')) continue;
    if (Array.isArray(f.tiers) && n.id !== sel && !f.tiers.includes(n.tier || 'core')) continue;
    if (!state.prefs.hideOrph || has.has(n.id) || n.id === sel) nodes.add(n.id);
  }
  return { nodes, causal, cors };
}

/**
 * 강조 노드 집합 (원본 nbr).
 * - 'both' + 켜진 상관선 있음: 원본 nbr과 같이 가시 인과 엣지 + 가시 상관선을 함께 쓰는 무방향 BFS.
 *   (원본 nbr은 VL = 가시 인과 + 가시 상관을 썼다.)
 * - 그 밖: neighborhood(g, sel, hop, dir, 가시 인과 엣지 필터). 'up'/'down'은 상관선을 쓰지 않는다
 *   (상관은 방향이 없어서 원인/결과 구분에 넣을 수 없음).
 * @param {Graph} g
 * @param {string} sel
 * @param {1|2} hop
 * @param {'both'|'up'|'down'} dir
 * @param {Filters} filters
 * @param {{causal: EdgeData[], cors: CorData[]}} vis  visible() 결과
 * @returns {Set<string>}
 */
export function highlight(g, sel, hop, dir, filters, vis) {
  if (dir === 'both' && vis.cors.length > 0) {
    /** @type {Set<string>} */
    const s = new Set([sel]);
    for (let i = 0; i < hop; i++) {
      /** @type {string[]} */
      const add = [];
      for (const e of vis.causal) {
        if (s.has(e.src)) add.push(e.dst);
        if (s.has(e.dst)) add.push(e.src);
      }
      for (const c of vis.cors) {
        if (s.has(c.src)) add.push(c.dst);
        if (s.has(c.dst)) add.push(c.src);
      }
      for (const x of add) s.add(x);
    }
    return s;
  }
  return neighborhood(g, sel, hop, dir, (e) => causalVisible(g, e, filters));
}

/**
 * 캔버스 강조 집합. 루프·경로 탭에서 고른 trace가 있으면 그것만 강조하고(edgeIds = trace.edges),
 * 없으면 선택 노드의 highlight 결과를 쓴다(edgeIds = null: 캔버스는 기존 규칙으로 선을 고른다).
 * 강조할 것이 없으면(선택·trace 모두 없음) null.
 * @param {Graph} g
 * @param {AppState} state
 * @param {{causal: EdgeData[], cors: CorData[]}} vis  visible() 결과
 * @returns {{nodes: Set<string>, edgeIds: Set<string>|null}|null}
 */
export function emphasis(g, state, vis) {
  const tr = state.view.trace;
  if (tr) return { nodes: new Set(tr.nodes), edgeIds: new Set(tr.edges) };
  const sel = state.view.selected;
  if (!sel) return null;
  return { nodes: highlight(g, sel, state.view.hop, state.view.dir, state.filters, vis), edgeIds: null };
}
