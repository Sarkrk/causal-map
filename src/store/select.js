// @ts-check
// 가시성 선택자와 강조 이웃 계산. canvas와 패널이 같은 함수를 쓴다. 전부 순수 함수.
import { neighborhood } from '../engine/traverse.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').CorData} CorData */
/** @typedef {import('./store.js').AppState} AppState */
/** @typedef {import('./store.js').Filters} Filters */

/**
 * @param {Graph} g
 * @param {string} src
 * @param {string} dst
 * @param {Filters} f
 * @returns {boolean}
 */
function catsOk(g, src, dst, f) {
  const a = g.byId.get(src);
  const b = g.byId.get(dst);
  return !!a && !!b && f.cats.includes(a.cat) && f.cats.includes(b.cat);
}

/**
 * 인과 엣지 표시 여부 (원본 lvis, k==='c').
 * @param {Graph} g
 * @param {EdgeData} e
 * @param {Filters} f
 * @returns {boolean}
 */
export function causalVisible(g, e, f) {
  if (!f.levels.includes(e.level)) return false;
  if (!f.weak && e.level === 'B' && e.sub === '-') return false;
  if (e.r == null ? !f.showNR : Math.abs(e.r) < f.thr) return false;
  return catsOk(g, e.src, e.dst, f);
}

/**
 * 상관선 표시 여부 (원본 lvis, k==='r'). thr은 적용하지 않는다(원본과 같음).
 * @param {Graph} g
 * @param {CorData} c
 * @param {Filters} f
 * @returns {boolean}
 */
export function corVisible(g, c, f) {
  return f.showCor && catsOk(g, c.src, c.dst, f);
}

/**
 * 가시성 전체 계산 (원본 recompute). 노드 = 범주 켜짐 && (고립 숨김 끔 || 가시 엣지 끝점 || 선택 노드).
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
  /** @type {Set<string>} */
  const nodes = new Set();
  for (const n of g.nodes) {
    if (!f.cats.includes(n.cat)) continue;
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
