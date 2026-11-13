// @ts-check
// 시뮬레이터 블랙박스 테스트(types.js 계약 기준). simulate.engine.test.mjs와 독립. 실행: node --test test/simulate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGraph } from '../src/engine/graph.js';
import { simulate } from '../src/engine/simulate.js';
import { migrate } from '../src/schema/migrate.js';

/**
 * @param {string[]} ids
 * @param {[string,string,string][]} es  [src,dst,sign] (모두 A등급)
 * @param {{src:string,dst:string,r:number}[]} [cors]
 */
function mk(ids, es, cors = []) {
  return createGraph(/** @type {any} */ ({
    schemaVersion: 2,
    meta: {},
    nodes: ids.map((id) => ({ id, name: id, cat: 'Other' })),
    edges: es.map(([src, dst, sign], i) => ({ id: `e${i}`, src, dst, sign, level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [], lag: null, regime: null })),
    cors,
  }));
}

const real = createGraph(migrate(JSON.parse(readFileSync(new URL('../graph.json', import.meta.url), 'utf8'))));
/** 인과 나가는 엣지가 가장 많은 노드 */
const hub = [...real.outE.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];

/** 계약 공통 검사 */
/** @param {import('../src/types.js').SimResult} r @param {number} [topK] */
function checkContract(r, topK) {
  const abs = r.impacts.map((i) => Math.abs(i.score));
  for (let i = 1; i < abs.length; i++) {
    assert.ok(abs[i - 1] >= abs[i] - 1e-12, '|score| 내림차순');
    if (Math.abs(abs[i - 1] - abs[i]) < 1e-12) assert.ok(r.impacts[i - 1].id < r.impacts[i].id, '동점은 id 오름차순');
  }
  assert.ok(!r.impacts.some((i) => i.id === r.start), 'start 제외');
  assert.equal(new Set(r.impacts.map((i) => i.id)).size, r.impacts.length, '노드 중복 없음');
  if (topK !== undefined) assert.ok(r.impacts.length <= topK);
}

test('직선 A→B→C: 부호 합성', () => {
  const g = mk(['A', 'B', 'C'], [['A', 'B', '-'], ['B', 'C', '-']]);
  const r = simulate(g, 'A', 1);
  checkContract(r);
  const by = Object.fromEntries(r.impacts.map((i) => [i.id, i]));
  assert.equal(by.B.sign, '-');
  assert.equal(by.C.sign, '+');
  assert.equal(r.start, 'A');
  assert.equal(r.shockSign, 1);
});

test('다이아몬드 상쇄 → ±', () => {
  const g = mk(['A', 'B', 'C', 'D'], [['A', 'B', '+'], ['A', 'C', '+'], ['B', 'D', '+'], ['C', 'D', '-']]);
  const r = simulate(g, 'A', 1);
  assert.equal(r.impacts.find((i) => i.id === 'D')?.sign, '±');
});

test('cors만 있는 쌍: 전파되지 않고 correlation-only 경고', () => {
  const g = mk(['A', 'B', 'X'], [['A', 'B', '+']], [{ src: 'A', dst: 'X', r: 0.8 }]);
  const r = simulate(g, 'A', 1);
  assert.ok(!r.impacts.some((i) => i.id === 'X'));
  assert.ok(!r.paths.some((p) => p.nodes.includes('X')));
  assert.ok(r.warnings.some((w) => w.kind === 'correlation-only' && w.nodes.includes('X')));
});

test('shockSign −1이면 모든 score 부호 반전(크기·순서 동일)', () => {
  const graphs = [
    mk(['A', 'B', 'C'], [['A', 'B', '-'], ['B', 'C', '+']]),
    mk(['A', 'B', 'C', 'D'], [['A', 'B', '+'], ['A', 'C', '+'], ['B', 'D', '+'], ['C', 'D', '-']]),
    real,
  ];
  for (const g of graphs) {
    const start = g === real ? hub : 'A';
    const up = simulate(g, start, 1);
    const dn = simulate(g, start, -1);
    assert.deepEqual(dn.impacts.map((i) => i.id), up.impacts.map((i) => i.id));
    for (let i = 0; i < up.impacts.length; i++) {
      assert.ok(Math.abs(dn.impacts[i].score + up.impacts[i].score) < 1e-9);
    }
  }
});

test('실제 graph.json: 정렬·start 제외·topK', () => {
  assert.ok((real.outE.get(hub) ?? []).length > 0);
  const r = simulate(real, hub, 1);
  checkContract(r, 15);
  assert.ok(r.impacts.length > 0);
  for (const k of [1, 3, 7]) checkContract(simulate(real, hub, 1, { topK: k }), k);
  assert.equal(simulate(real, hub, 1, { topK: 3 }).impacts.length, Math.min(3, simulate(real, hub, 1, { topK: 100 }).impacts.length));
});

test('실제 graph.json: 결과 노드는 인과 경로로 도달 가능(cors로 전파 안 됨)', () => {
  const r = simulate(real, hub, 1, { maxDepth: 6 });
  for (const p of r.paths) {
    assert.equal(p.nodes[0], hub);
    p.edges.forEach((e, i) => {
      assert.equal(e.src, p.nodes[i]);
      assert.equal(e.dst, p.nodes[i + 1]);
      assert.ok(real.edges.some((x) => x.id === e.id), '경로 엣지는 인과 엣지');
    });
  }
});

test('maxDepth 7은 6과 같은 결과', () => {
  const a = simulate(real, hub, 1, { maxDepth: 7 });
  const b = simulate(real, hub, 1, { maxDepth: 6 });
  assert.deepEqual(a, b);
});

test('입력 그래프를 바꾸지 않는다', () => {
  const before = JSON.stringify(real.edges);
  simulate(real, hub, -1, { activeRegime: 'stress' });
  assert.equal(JSON.stringify(real.edges), before);
});
