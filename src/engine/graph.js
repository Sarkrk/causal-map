// @ts-check
// GraphData(v1) → Graph: 인접 리스트(outE/inE)와 차수(deg) 계산. 입력은 변경하지 않는다.

/** @typedef {import('../types.js').GraphData} GraphData */
/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').Level} Level */

/** 부호 → 화면 표시 문자열(데이터는 ASCII '-', 화면은 U+2212). */
export const SIGN_LABEL = { '+': '+', '-': '\u2212', '±': '±' };

/** 등급 → 점수(루프·경로 정렬용, A가 가장 강함). */
export const LEVEL_GRADE = { A: 0, B: 1, C: 2, D: 3 };

/**
 * 엣지의 (src,dst) 쌍 키. 엣지 id와 무관하게 같은 방향 쌍을 식별한다.
 * @param {EdgeData} e
 * @returns {string}
 */
export function edgeKey(e) {
  return JSON.stringify([e.src, e.dst]);
}

/**
 * 등급 문자열을 점수로 바꾼다. 알 수 없으면 가장 약한 D(3)로 본다.
 * @param {Level} level
 * @returns {number}
 */
export function gradeOf(level) {
  const v = LEVEL_GRADE[level];
  return v === undefined ? LEVEL_GRADE.D : v;
}

/**
 * GraphData를 탐색용 Graph로 만든다. src/dst가 노드에 없는 엣지·코르는 버린다
 * (누락 보고는 validateGraph의 몫).
 * @param {GraphData} data
 * @returns {Graph}
 */
export function createGraph(data) {
  const nodes = data.nodes.slice();
  /** @type {Map<string, import('../types.js').NodeData>} */
  const byId = new Map();
  /** @type {Map<string, EdgeData[]>} */
  const outE = new Map();
  /** @type {Map<string, EdgeData[]>} */
  const inE = new Map();
  /** @type {Map<string, number>} */
  const deg = new Map();
  for (const n of nodes) {
    byId.set(n.id, n);
    outE.set(n.id, []);
    inE.set(n.id, []);
    deg.set(n.id, 0);
  }

  /** @type {EdgeData[]} */
  const edges = [];
  for (const e of data.edges) {
    if (!byId.has(e.src) || !byId.has(e.dst)) continue;
    edges.push(e);
    /** @type {EdgeData[]} */ (outE.get(e.src)).push(e);
    /** @type {EdgeData[]} */ (inE.get(e.dst)).push(e);
    deg.set(e.src, /** @type {number} */ (deg.get(e.src)) + 1);
    deg.set(e.dst, /** @type {number} */ (deg.get(e.dst)) + 1);
  }

  const cors = (data.cors ?? []).filter((c) => byId.has(c.src) && byId.has(c.dst));

  return { nodes, edges, cors, byId, outE, inE, deg };
}
