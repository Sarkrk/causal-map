// @ts-check
// 부호 곱, 두 노드 사이 단순 경로 탐색.

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').EdgeFilter} EdgeFilter */
/** @typedef {import('../types.js').Path} Path */
/** @typedef {import('../types.js').Sign} Sign */
/** @typedef {import('../types.js').ScoredPath} ScoredPath */
/** @typedef {import('../types.js').Level} Level */
import { compareCycles, cmpStr } from './cycles.js';
import { regimeFilter } from './regime.js';
import { LAG_MONTHS, LEVEL_WEIGHT } from '../schema/v2.js';
import { gradeOf } from './graph.js';
import { distancesTo } from './traverse.js';

/**
 * 경로의 부호 곱. ±가 하나라도 있으면 '±', 음(-)이 홀수 개면 '-', 아니면 '+'. 빈 배열은 '+'.
 * @param {EdgeData[]} edges
 * @returns {Sign}
 */
export function signProduct(edges) {
  if (edges.some((e) => e.sign === '±')) return '±';
  return edges.filter((e) => e.sign === '-').length % 2 === 1 ? '-' : '+';
}

/**
 * from에서 to로 가는 단순 경로(노드 반복 없음, 길이 1..maxLen).
 * 정렬: 길이 → 등급 합 → 노드 문자열. 최대 k개. from===to 이면 [].
 * @param {Graph} g
 * @param {string} from
 * @param {string} to
 * @param {{maxLen?:number, k?:number, filter?:EdgeFilter}} [opts]
 * @returns {Path[]}
 */
export function findPaths(g, from, to, opts = {}) {
  const { maxLen = 4, k = 10, filter } = opts;
  if (from === to || !g.byId.has(from) || !g.byId.has(to) || maxLen < 1 || k < 1) return [];

  // 가지치기: 노드 → to 까지 최소 hop
  const toTarget = distancesTo(g, to, filter, maxLen);
  if (!toTarget.has(from)) return [];

  /** @type {Path[]} */
  const found = [];
  /** @type {string[]} */
  const pathNodes = [from];
  /** @type {Set<string>} */
  const onPath = new Set([from]);
  /** @type {EdgeData[]} */
  const pathEdges = [];

  /**
   * @param {string} v  현재 노드
   * @param {number} depth  지금까지 사용한 엣지 수 (< maxLen 보장)
   * @returns {void}
   */
  function dfs(v, depth) {
    const d = depth + 1;
    for (const e of g.outE.get(v) ?? []) {
      if (filter && !filter(e)) continue;
      const w = e.dst;
      if (w === to) {
        const edges = [...pathEdges, e];
        found.push({ nodes: [...pathNodes, to], edges, sign: signProduct(edges) });
        continue;
      }
      if (onPath.has(w) || d >= maxLen) continue;
      const rest = toTarget.get(w);
      if (rest === undefined || d + rest > maxLen) continue;
      onPath.add(w);
      pathNodes.push(w);
      pathEdges.push(e);
      dfs(w, d);
      pathEdges.pop();
      pathNodes.pop();
      onPath.delete(w);
    }
  }
  dfs(from, 0);

  return found
    .sort((x, y) => compareCycles({ nodes: x.nodes, edges: x.edges }, { nodes: y.nodes, edges: y.edges }))
    .slice(0, k);
}

/**
 * 경로에 신뢰도·누적 시차를 붙인다. confidence = Π 등급 가중치, lagMonths = Σ 대표 시차(lag null은 0으로
 * 더하고 unknownLags+1), minLevel = 가장 약한 등급(빈 경로는 'A', confidence 1).
 * @param {Path} path
 * @returns {ScoredPath}
 */
export function scorePath(path) {
  let confidence = 1;
  let lagMonths = 0;
  let unknownLags = 0;
  /** @type {Level} */
  let minLevel = 'A';
  for (const e of path.edges) {
    confidence *= LEVEL_WEIGHT[e.level] ?? LEVEL_WEIGHT.D;
    if (e.lag == null) unknownLags++;
    else lagMonths += LAG_MONTHS[e.lag] ?? 0;
    if (gradeOf(e.level) > gradeOf(minLevel)) minLevel = e.level;
  }
  return { ...path, confidence, lagMonths, unknownLags, minLevel };
}

/**
 * 점수 경로 비교: confidence 내림차순 → lagMonths 오름차순 → 길이 → 노드열 문자열.
 * @param {ScoredPath} x
 * @param {ScoredPath} y
 * @returns {number}
 */
export function compareScored(x, y) {
  return (
    y.confidence - x.confidence ||
    x.lagMonths - y.lagMonths ||
    x.edges.length - y.edges.length ||
    cmpStr(x.nodes.join('\u0001'), y.nodes.join('\u0001'))
  );
}

/**
 * findPaths 후보 전부를 scorePath로 감싸 compareScored 순으로 정렬해 k개 돌려준다.
 * 국면 규칙은 항상 적용: opts.activeRegime가 없으면 평시 가정(regimeFilter). opts.filter와 AND.
 * @param {Graph} g
 * @param {string} from
 * @param {string} to
 * @param {{maxLen?:number, k?:number, filter?:EdgeFilter, activeRegime?:string|null}} [opts]
 * @returns {ScoredPath[]}
 */
export function findScoredPaths(g, from, to, opts = {}) {
  const { k = 10, filter, activeRegime } = opts;
  const rf = regimeFilter(activeRegime);
  /** @type {EdgeFilter} */
  const f = filter ? (e) => rf(e) && filter(e) : rf;
  const all = findPaths(g, from, to, { maxLen: opts.maxLen, k: Infinity, filter: f });
  return all.map(scorePath).sort(compareScored).slice(0, Math.max(0, k));
}
