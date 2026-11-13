// @ts-check
// 강연결 성분(Tarjan, 반복형), 극성, 루프 탐색.

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').EdgeFilter} EdgeFilter */
/** @typedef {import('../types.js').Loop} Loop */
import { gradeOf } from './graph.js';
import { distancesTo } from './traverse.js';

/**
 * 두 문자열을 사전순으로 비교한다(정렬 비교 함수).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 강연결 성분을 구한다(Tarjan, 명시적 스택 사용·재귀 없음). 단일 노드 성분 포함.
 * 결과: 크기 내림차순, 같은 크기는 g.nodes 순서상 먼저 나오는 성분이 앞. 성분 안 노드도 g.nodes 순서.
 * @param {Graph} g
 * @param {EdgeFilter} [filter]
 * @returns {string[][]}
 */
export function scc(g, filter) {
  /** @type {Map<string, string[]>} */
  const adj = new Map();
  /** @type {Map<string, number>} */
  const pos = new Map();
  g.nodes.forEach((n, i) => {
    pos.set(n.id, i);
    adj.set(n.id, []);
  });
  for (const e of g.edges) {
    if (filter && !filter(e)) continue;
    /** @type {string[]} */ (adj.get(e.src)).push(e.dst);
  }

  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {Map<string, number>} */
  const low = new Map();
  /** @type {Set<string>} */
  const onStack = new Set();
  /** @type {string[]} */
  const stack = [];
  /** @type {string[][]} */
  const comps = [];
  let counter = 0;

  for (const n of g.nodes) {
    const root = n.id;
    if (index.has(root)) continue;
    // 작업 스택: [노드, 다음으로 볼 이웃 인덱스]
    /** @type {[string, number][]} */
    const work = [[root, 0]];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = /** @type {[string, number]} */ (work[work.length - 1]);
      const v = frame[0];
      const nbrs = /** @type {string[]} */ (adj.get(v));
      if (frame[1] < nbrs.length) {
        const w = nbrs[frame[1]++];
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(/** @type {number} */ (low.get(v)), /** @type {number} */ (index.get(w))));
        }
      } else {
        work.pop();
        if (work.length > 0) {
          const u = work[work.length - 1][0];
          low.set(u, Math.min(/** @type {number} */ (low.get(u)), /** @type {number} */ (low.get(v))));
        }
        if (low.get(v) === index.get(v)) {
          /** @type {string[]} */
          const comp = [];
          let w;
          do {
            w = /** @type {string} */ (stack.pop());
            onStack.delete(w);
            comp.push(w);
          } while (w !== v);
          comp.sort((a, b) => /** @type {number} */ (pos.get(a)) - /** @type {number} */ (pos.get(b)));
          comps.push(comp);
        }
      }
    }
  }

  comps.sort((a, b) => b.length - a.length || /** @type {number} */ (pos.get(a[0])) - /** @type {number} */ (pos.get(b[0])));
  return comps;
}

/**
 * 루프 극성. ±가 하나라도 있으면 '?', 음(-) 개수가 짝수면 'R'(강화), 홀수면 'B'(균형).
 * @param {EdgeData[]} edges
 * @returns {'R'|'B'|'?'}
 */
export function polarity(edges) {
  if (edges.some((e) => e.sign === '±')) return '?';
  const neg = edges.filter((e) => e.sign === '-').length;
  return neg % 2 === 0 ? 'R' : 'B';
}

/**
 * 루프 정렬 비교: 길이 → 등급 합 → 노드 문자열(사전순, 결정성 보장).
 * @param {{nodes:string[], edges:EdgeData[]}} x
 * @param {{nodes:string[], edges:EdgeData[]}} y
 * @returns {number}
 */
export function compareCycles(x, y) {
  return (
    x.edges.length - y.edges.length ||
    gradeSum(x.edges) - gradeSum(y.edges) ||
    cmpStr(x.nodes.join('\u0001'), y.nodes.join('\u0001'))
  );
}

/**
 * 엣지 등급 합.
 * @param {EdgeData[]} edges
 * @returns {number}
 */
export function gradeSum(edges) {
  let s = 0;
  for (const e of edges) s += gradeOf(e.level);
  return s;
}

/**
 * id를 지나는 단순 순환(노드 반복 없음)을 찾는다. 길이 maxLen 이하.
 * 각 루프는 id에서 시작하도록 회전되어 있고, 노드 배열 문자열로 중복을 제거한다.
 * 정렬: 길이 오름차순 → 등급 합 오름차순 → 노드 문자열. 최대 limit개.
 * @param {Graph} g
 * @param {string} id
 * @param {{maxLen?:number, limit?:number, filter?:EdgeFilter}} [opts]
 * @returns {Loop[]}
 */
export function findLoops(g, id, opts = {}) {
  const { maxLen = 4, limit = 50, filter } = opts;
  if (!g.byId.has(id) || maxLen < 1 || limit < 1) return [];

  // 가지치기: 노드 → id 까지 최소 hop
  const back = distancesTo(g, id, filter, maxLen);

  /** @type {Map<string, {nodes:string[], edges:EdgeData[]}>} */
  const found = new Map();
  /** @type {string[]} */
  const pathNodes = [id];
  /** @type {Set<string>} */
  const onPath = new Set([id]);
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
      if (w === id) {
        const edges = [...pathEdges, e];
        const key = pathNodes.join('\u0001');
        if (!found.has(key)) found.set(key, { nodes: pathNodes.slice(), edges });
        continue;
      }
      if (onPath.has(w) || d >= maxLen) continue;
      const toId = back.get(w);
      if (toId === undefined || d + toId > maxLen) continue;
      onPath.add(w);
      pathNodes.push(w);
      pathEdges.push(e);
      dfs(w, d);
      pathEdges.pop();
      pathNodes.pop();
      onPath.delete(w);
    }
  }
  dfs(id, 0);

  return [...found.values()]
    .sort(compareCycles)
    .slice(0, limit)
    .map((c) => ({ nodes: c.nodes, edges: c.edges, polarity: polarity(c.edges) }));
}
