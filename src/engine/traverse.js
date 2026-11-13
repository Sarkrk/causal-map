// @ts-check
// 이웃·상위(원인)·하위(결과) 탐색. 모두 BFS, 입력 변경 없음.

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').EdgeFilter} EdgeFilter */
/** @typedef {import('../types.js').Direction} Direction */

/**
 * 한 노드의 이웃 엣지 중 filter를 통과하는 것의 상대 노드를 돌려준다.
 * @param {Graph} g
 * @param {string} v
 * @param {'up'|'down'|'both'} side  up=inE(원인), down=outE(결과), both=둘 다
 * @param {EdgeFilter|undefined} filter
 * @returns {string[]}
 */
function neighborsOf(g, v, side, filter) {
  /** @type {string[]} */
  const out = [];
  if (side === 'up' || side === 'both') {
    for (const e of g.inE.get(v) ?? []) {
      if (!filter || filter(e)) out.push(e.src);
    }
  }
  if (side === 'down' || side === 'both') {
    for (const e of g.outE.get(v) ?? []) {
      if (!filter || filter(e)) out.push(e.dst);
    }
  }
  return out;
}

/**
 * 레벨 단위 BFS. 시작 노드는 hop 0.
 * @param {Graph} g
 * @param {string} id
 * @param {number} depth  최대 hop (Infinity 가능)
 * @param {'up'|'down'|'both'} side
 * @param {EdgeFilter|undefined} filter
 * @returns {Map<string, number>}
 */
function bfs(g, id, depth, side, filter) {
  /** @type {Map<string, number>} */
  const hops = new Map([[id, 0]]);
  let frontier = [id];
  for (let h = 1; h <= depth && frontier.length > 0; h++) {
    /** @type {string[]} */
    const next = [];
    for (const v of frontier) {
      for (const w of neighborsOf(g, v, side, filter)) {
        if (hops.has(w)) continue;
        hops.set(w, h);
        next.push(w);
      }
    }
    frontier = next;
  }
  return hops;
}

/**
 * 원인 방향(inE)으로 depth hop까지 도달한 노드와 hop 수.
 * @param {Graph} g
 * @param {string} id
 * @param {number} [depth=Infinity]
 * @param {EdgeFilter} [filter]
 * @returns {Map<string, number>}  id 자신은 0
 */
export function upstream(g, id, depth = Infinity, filter) {
  return bfs(g, id, depth, 'up', filter);
}

/**
 * 결과 방향(outE)으로 depth hop까지 도달한 노드와 hop 수.
 * @param {Graph} g
 * @param {string} id
 * @param {number} [depth=Infinity]
 * @param {EdgeFilter} [filter]
 * @returns {Map<string, number>}  id 자신은 0
 */
export function downstream(g, id, depth = Infinity, filter) {
  return bfs(g, id, depth, 'down', filter);
}

/**
 * 이웃 노드 집합.
 * - 'both': 방향 무시 BFS (기존 app.js nbr()와 동일 결과)
 * - 'up': upstream 키, 'down': downstream 키
 * @param {Graph} g
 * @param {string} id
 * @param {number} depth
 * @param {Direction} dir
 * @param {EdgeFilter} [filter]
 * @returns {Set<string>}
 */
export function neighborhood(g, id, depth, dir, filter) {
  if (dir !== 'both' && dir !== 'up' && dir !== 'down') {
    throw new TypeError(`unknown direction "${String(dir)}"`);
  }
  return new Set(bfs(g, id, depth, dir, filter).keys());
}

/**
 * 양 끝이 모두 ids 안에 있는 엣지(엣지 배열 순서 유지).
 * @param {Graph} g
 * @param {Iterable<string>} ids
 * @param {EdgeFilter} [filter]
 * @returns {EdgeData[]}
 */
export function edgesAmong(g, ids, filter) {
  const set = new Set(ids);
  return g.edges.filter((e) => set.has(e.src) && set.has(e.dst) && (!filter || filter(e)));
}

/**
 * target으로 들어오는 방향(inE)을 거슬러 올라가며 각 노드의 최소 hop(노드→target)을 구한다.
 * 가지치기(prune)용. maxDepth를 넘는 노드는 포함하지 않는다.
 * @param {Graph} g
 * @param {string} target
 * @param {EdgeFilter|undefined} filter
 * @param {number} maxDepth
 * @returns {Map<string, number>}  target 자신은 0
 */
export function distancesTo(g, target, filter, maxDepth) {
  /** @type {Map<string, number>} */
  const dist = new Map([[target, 0]]);
  let frontier = [target];
  for (let h = 1; h <= maxDepth && frontier.length > 0; h++) {
    /** @type {string[]} */
    const next = [];
    for (const v of frontier) {
      for (const e of g.inE.get(v) ?? []) {
        if (filter && !filter(e)) continue;
        if (dist.has(e.src)) continue;
        dist.set(e.src, h);
        next.push(e.src);
      }
    }
    frontier = next;
  }
  return dist;
}
