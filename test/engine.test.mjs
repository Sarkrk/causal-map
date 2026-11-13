// @ts-check
// 엔진 테스트(탐색·순환·경로). 실행: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v1 from './fixtures/graph.v1.json' with { type: 'json' };
import { createGraph, SIGN_LABEL } from '../src/engine/graph.js';
import { upstream, downstream, neighborhood, edgesAmong } from '../src/engine/traverse.js';
import { scc, findLoops, polarity } from '../src/engine/cycles.js';
import { findPaths, signProduct } from '../src/engine/paths.js';

/** @typedef {import('../src/types.js').EdgeData} EdgeData */
/** @typedef {import('../src/types.js').NodeData} NodeData */
/** @typedef {import('../src/types.js').Level} Level */
/** @typedef {import('../src/types.js').Sign} Sign */
/** @typedef {import('../src/types.js').Graph} Graph */

/**
 * @param {string} id
 * @returns {NodeData}
 */
function mkNode(id) {
  return { id, name: id, cat: 'Other' };
}

/**
 * @param {string} id
 * @param {string} src
 * @param {string} dst
 * @param {Sign} sign
 * @param {Level} [level]
 * @returns {EdgeData}
 */
function mkEdge(id, src, dst, sign, level = 'C') {
  return { id, src, dst, sign, level, status: 'open', note: '', r: null, rsrc: '', evidence: [] };
}

/**
 * @param {NodeData[]} nodes
 * @param {EdgeData[]} edges
 * @returns {Graph}
 */
function mkGraph(nodes, edges) {
  return createGraph({ schemaVersion: 1, meta: { version: 't', generated: '', nodes: nodes.length, edges: edges.length, levels: {} }, nodes, edges, cors: [] });
}

/** 작은 픽스처: A→B(+), B→C(-), C→A(+), C→D(+). D는 고립이 아님. */
const SMALL = mkGraph(
  ['A', 'B', 'C', 'D'].map(mkNode),
  [mkEdge('E1', 'A', 'B', '+'), mkEdge('E2', 'B', 'C', '-'), mkEdge('E3', 'C', 'A', '+'), mkEdge('E4', 'C', 'D', '+')],
);

/**
 * Map을 {노드:hop} 객체로 바꿔 비교하기 쉽게 한다.
 * @param {Map<string, number>} m
 * @returns {Record<string, number>}
 */
function obj(m) {
  return Object.fromEntries([...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const noNeg = (/** @type {EdgeData} */ e) => e.sign !== '-';

test('upstream/downstream: 방향과 hop', () => {
  assert.deepEqual(obj(upstream(SMALL, 'A')), { A: 0, B: 2, C: 1 });
  assert.deepEqual(obj(downstream(SMALL, 'A')), { A: 0, B: 1, C: 2, D: 3 });
  assert.deepEqual(obj(downstream(SMALL, 'A', 1)), { A: 0, B: 1 });
  assert.deepEqual(obj(upstream(SMALL, 'D')), { A: 3, B: 2, C: 1, D: 0 });
});

test('upstream/downstream: filter 적용(음의 엣지 제외)', () => {
  assert.deepEqual(obj(upstream(SMALL, 'A', Infinity, noNeg)), { A: 0, C: 1 });
  assert.deepEqual(obj(downstream(SMALL, 'A', Infinity, noNeg)), { A: 0, B: 1 });
});

test('neighborhood 3방향', () => {
  assert.deepEqual([...neighborhood(SMALL, 'D', 1, 'both')].sort(), ['C', 'D']);
  assert.deepEqual([...neighborhood(SMALL, 'D', 2, 'both')].sort(), ['A', 'B', 'C', 'D']);
  assert.deepEqual([...neighborhood(SMALL, 'D', 3, 'both')].sort(), ['A', 'B', 'C', 'D']);
  assert.deepEqual([...neighborhood(SMALL, 'C', 1, 'up')].sort(), ['B', 'C']);
  assert.deepEqual([...neighborhood(SMALL, 'C', 1, 'down')].sort(), ['A', 'C', 'D']);
  assert.throws(() => neighborhood(SMALL, 'C', 1, /** @type {any} */ ('left')), TypeError);
});

test('edgesAmong: 양 끝이 집합 안인 엣지만', () => {
  assert.deepEqual(edgesAmong(SMALL, ['A', 'B', 'C']).map((e) => e.id), ['E1', 'E2', 'E3']);
  assert.deepEqual(edgesAmong(SMALL, ['A', 'D']).map((e) => e.id), []);
});

test('scc: 작은 그래프 성분', () => {
  const comps = scc(SMALL);
  assert.deepEqual(comps.map((c) => c.length), [3, 1]);
  assert.deepEqual([...comps[0]].sort(), ['A', 'B', 'C']);
  assert.deepEqual(comps[1], ['D']);
  const noNegComps = scc(SMALL, noNeg);
  assert.deepEqual(noNegComps.map((c) => c.length), [1, 1, 1, 1]);
});

test('findLoops: A 기준 루프 1개, 극성 B(음 1개)', () => {
  const loops = findLoops(SMALL, 'A', { maxLen: 4 });
  assert.equal(loops.length, 1);
  assert.deepEqual(loops[0].nodes, ['A', 'B', 'C']);
  assert.deepEqual(loops[0].edges.map((e) => e.id), ['E1', 'E2', 'E3']);
  assert.equal(loops[0].polarity, 'B');
  assert.deepEqual(findLoops(SMALL, 'A', { maxLen: 2 }), []);
  assert.deepEqual(findLoops(SMALL, 'D', { maxLen: 4 }), []);
  assert.deepEqual(findLoops(SMALL, '없는노드'), []);
});

test('findPaths: A→D 경로 하나, 부호 곱 -', () => {
  const paths = findPaths(SMALL, 'A', 'D', { maxLen: 4 });
  assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].nodes, ['A', 'B', 'C', 'D']);
  assert.equal(paths[0].sign, '-');
  assert.deepEqual(findPaths(SMALL, 'A', 'D', { maxLen: 2 }), []);
  assert.deepEqual(findPaths(SMALL, 'A', 'A'), []);
});

test('signProduct / polarity 규칙', () => {
  assert.equal(signProduct([]), '+');
  assert.equal(signProduct([mkEdge('x', 'a', 'b', '+'), mkEdge('y', 'b', 'c', '+')]), '+');
  assert.equal(signProduct([mkEdge('x', 'a', 'b', '+'), mkEdge('y', 'b', 'c', '-')]), '-');
  assert.equal(signProduct([mkEdge('x', 'a', 'b', '-'), mkEdge('y', 'b', 'c', '-')]), '+');
  assert.equal(signProduct([mkEdge('x', 'a', 'b', '+'), mkEdge('y', 'b', 'c', '±')]), '±');
  assert.equal(polarity([]), 'R');
  assert.equal(polarity([mkEdge('x', 'a', 'b', '+'), mkEdge('y', 'b', 'c', '-')]), 'B');
  assert.equal(polarity([mkEdge('x', 'a', 'b', '-'), mkEdge('y', 'b', 'c', '-')]), 'R');
  assert.equal(polarity([mkEdge('x', 'a', 'b', '±'), mkEdge('y', 'b', 'c', '-')]), '?');
  assert.equal(SIGN_LABEL['-'], '\u2212');
});

test('findPaths 정렬: 길이 → 등급 합, k로 자르기', () => {
  const G = mkGraph(
    ['X', 'Y', 'M', 'P', 'Q', 'R'].map(mkNode),
    [
      mkEdge('e1', 'X', 'Y', '+', 'D'),
      mkEdge('e2', 'X', 'M', '+', 'A'),
      mkEdge('e3', 'M', 'Y', '+', 'A'),
      mkEdge('e4', 'X', 'P', '+', 'C'),
      mkEdge('e5', 'P', 'Y', '+', 'D'),
      mkEdge('e6', 'X', 'Q', '+', 'A'),
      mkEdge('e7', 'Q', 'R', '+', 'A'),
      mkEdge('e8', 'R', 'Y', '+', 'A'),
    ],
  );
  const all = findPaths(G, 'X', 'Y', { maxLen: 4 }).map((p) => p.nodes.join('>'));
  assert.deepEqual(all, ['X>Y', 'X>M>Y', 'X>P>Y', 'X>Q>R>Y']);
  assert.deepEqual(findPaths(G, 'X', 'Y', { maxLen: 4, k: 2 }).map((p) => p.nodes.join('>')), ['X>Y', 'X>M>Y']);
  assert.equal(findPaths(G, 'X', 'Y', { maxLen: 2 }).length, 3);
});

test('findLoops 정렬: 길이 → 등급 합, limit', () => {
  const G = mkGraph(
    ['X', 'Y', 'M', 'P', 'Q'].map(mkNode),
    [
      mkEdge('a1', 'X', 'Y', '+', 'B'),
      mkEdge('a2', 'Y', 'X', '+', 'B'),
      mkEdge('b1', 'X', 'M', '+', 'A'),
      mkEdge('b2', 'M', 'X', '-', 'A'),
      mkEdge('c1', 'X', 'P', '+', 'C'),
      mkEdge('c2', 'P', 'Q', '+', 'C'),
      mkEdge('c3', 'Q', 'X', '+', 'C'),
    ],
  );
  const loops = findLoops(G, 'X', { maxLen: 3 });
  assert.deepEqual(loops.map((l) => l.nodes.join('>')), ['X>M', 'X>Y', 'X>P>Q']);
  assert.deepEqual(loops.map((l) => l.polarity), ['B', 'R', 'R']);
  assert.equal(findLoops(G, 'X', { maxLen: 3, limit: 2 }).length, 2);
});

// ── 실데이터(v1 픽스처, 83노드/245엣지) ──────────────────────────────────

const REAL = createGraph(/** @type {any} */ (v1));

/**
 * app.js 36행 nbr()를 그대로 옮긴 참조 구현(VL = 전체 엣지).
 * @param {EdgeData[]} links
 * @param {string} n
 * @param {number} h
 * @returns {Set<string>}
 */
function nbrRef(links, n, h) {
  const s = new Set([n]);
  for (let i = 0; i < h; i++) {
    /** @type {string[]} */
    const add = [];
    links.forEach((l) => {
      if (s.has(l.src)) add.push(l.dst);
      if (s.has(l.dst)) add.push(l.src);
    });
    add.forEach((x) => s.add(x));
  }
  return s;
}

test('실데이터 scc: 최대 63, 두 번째 2', () => {
  const comps = scc(REAL);
  assert.equal(comps[0].length, 63);
  assert.equal(comps[1].length, 2);
  const top3 = comps.slice(0, 3).map((c) => c.length);
  assert.deepEqual(top3, [63, 2, comps[2].length]);
  assert.equal(comps.reduce((s, c) => s + c.length, 0), 83);
});

test('실데이터 neighborhood(both) = app.js nbr() (hop 1, 2)', () => {
  const sample = REAL.nodes.filter((_, i) => i % 13 === 0).map((n) => n.id);
  assert.ok(sample.length >= 5, `sample ${sample.length}`);
  for (const id of sample) {
    for (const h of [1, 2]) {
      const got = [...neighborhood(REAL, id, h, 'both')].sort();
      const want = [...nbrRef(REAL.edges, id, h)].sort();
      assert.deepEqual(got, want, `${id} hop ${h}`);
    }
  }
});

test('실데이터 findLoops(유가, maxLen 4): 50ms 이내, 정렬·중복·극성 규칙', (t) => {
  const t0 = performance.now();
  const loops = findLoops(REAL, '유가', { maxLen: 4 });
  const ms = performance.now() - t0;
  t.diagnostic(`findLoops 유가 maxLen4: ${loops.length} loops, ${ms.toFixed(2)} ms`);
  assert.ok(ms < 50, `took ${ms} ms`);
  assert.ok(loops.length > 0, '유가 루프 0개');
  const keys = new Set(loops.map((l) => l.nodes.join('\u0001')));
  assert.equal(keys.size, loops.length, '루프 중복');
  let prev = null;
  for (const l of loops) {
    assert.equal(l.nodes[0], '유가');
    assert.equal(new Set(l.nodes).size, l.nodes.length, '노드 반복');
    assert.equal(l.edges.length, l.nodes.length);
    l.edges.forEach((e, i) => {
      assert.equal(e.src, l.nodes[i]);
      assert.equal(e.dst, l.nodes[(i + 1) % l.nodes.length]);
    });
    assert.equal(l.polarity, polarity(l.edges));
    if (prev) {
      assert.ok(prev.edges.length <= l.edges.length, '길이 오름차순');
    }
    prev = l;
  }
});

test('실데이터 findPaths(유가→코스피, maxLen 4): 50ms 이내, 정렬·부호 규칙', (t) => {
  const t0 = performance.now();
  const paths = findPaths(REAL, '유가', '코스피', { maxLen: 4 });
  const ms = performance.now() - t0;
  t.diagnostic(`findPaths 유가→코스피 maxLen4: ${paths.length} paths, ${ms.toFixed(2)} ms`);
  assert.ok(ms < 50, `took ${ms} ms`);
  assert.ok(paths.length > 0, '유가→코스피 경로 0개');
  for (const p of paths) {
    assert.equal(p.nodes[0], '유가');
    assert.equal(p.nodes[p.nodes.length - 1], '코스피');
    assert.equal(new Set(p.nodes).size, p.nodes.length, '노드 반복');
    assert.equal(p.sign, signProduct(p.edges));
  }
  for (let i = 1; i < paths.length; i++) {
    assert.ok(paths[i - 1].edges.length <= paths[i].edges.length, '길이 오름차순');
  }
});
