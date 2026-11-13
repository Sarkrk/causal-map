// @ts-check
// simulate 엔진 단위 테스트(작성자 검증용).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGraph } from '../src/engine/graph.js';
import { simulate } from '../src/engine/simulate.js';
import { migrate } from '../src/schema/migrate.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/graph.v2.json', import.meta.url), 'utf8'));
const real = JSON.parse(readFileSync(new URL('../graph.json', import.meta.url), 'utf8'));

/** @param {any} o */
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
/** @param {any} r @param {string} id */
const imp = (r, id) => r.impacts.find((/** @type {any} */ i) => i.id === id);
const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 1e-9;

/**
 * 간이 그래프.
 * @param {string[]} ids
 * @param {[string,string,string,string?,string?][]} es  [src,dst,sign,level,regime]
 * @param {any[]} [cors]
 */
function mk(ids, es, cors = []) {
  return createGraph(/** @type {any} */ ({
    schemaVersion: 2,
    meta: {},
    nodes: ids.map((id) => ({ id, name: id, cat: 'Other' })),
    edges: es.map(([src, dst, sign, level, regime], i) => ({ id: `e${i}`, src, dst, sign, level: level ?? 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [], lag: null, regime: regime ?? null })),
    cors,
  }));
}

test('부호 전파: − 엣지는 뒤집히고 충격 부호도 곱해진다', () => {
  const g = mk(['a', 'b', 'c'], [['a', 'b', '-'], ['b', 'c', '-']]);
  const up = simulate(g, 'a', 1);
  assert.equal(imp(up, 'b').sign, '-');
  assert.equal(imp(up, 'c').sign, '+');
  const down = simulate(g, 'a', -1);
  assert.equal(imp(down, 'b').sign, '+');
  assert.equal(imp(down, 'c').sign, '-');
  assert.ok(near(imp(up, 'c').score, 1));
  assert.ok(near(imp(down, 'c').score, -1));
});

test('confidence가 크기를 만든다(B=.75, 2홉 .75*.5)', () => {
  const g = mk(['a', 'b', 'c'], [['a', 'b', '+', 'B'], ['b', 'c', '+', 'C']]);
  const r = simulate(g, 'a', 1);
  assert.ok(near(imp(r, 'b').score, 0.75));
  assert.ok(near(imp(r, 'c').score, 0.375));
  assert.equal(imp(r, 'c').depth, 2);
});

test('±: 기여 절댓값이 ambiguousMass로, 부호는 ±', () => {
  const g = mk(['a', 'b', 'c'], [['a', 'b', '±'], ['b', 'c', '+']]);
  const r = simulate(g, 'a', 1);
  assert.equal(imp(r, 'b').sign, '±');
  assert.ok(near(imp(r, 'b').ambiguousMass, 1));
  assert.equal(imp(r, 'b').posMass, 0);
  assert.equal(imp(r, 'c').sign, '±');
});

test('양·음 경로가 상쇄되면 ±(|score| < 10%)', () => {
  const g = mk(['a', 'b', 'c', 'd'], [['a', 'b', '+'], ['a', 'c', '+'], ['b', 'd', '+'], ['c', 'd', '-']]);
  const r = simulate(g, 'a', 1);
  assert.equal(imp(r, 'd').sign, '±');
  assert.ok(near(imp(r, 'd').posMass, 1));
  assert.ok(near(imp(r, 'd').negMass, 1));
});

test('한쪽이 우세하면 부호 유지', () => {
  const g = mk(['a', 'b', 'c', 'd'], [['a', 'b', '+', 'A'], ['a', 'c', '+', 'D'], ['b', 'd', '+'], ['c', 'd', '-']]);
  const r = simulate(g, 'a', 1);
  assert.equal(imp(r, 'd').sign, '+');
  assert.ok(near(imp(r, 'd').score, 0.75));
});

test('impacts: start 제외, |score|↓ → id순, topK', () => {
  const g = createGraph(fx);
  const r = simulate(g, '수요', 1, { topK: 3 });
  assert.ok(r.impacts.length <= 3);
  assert.ok(!r.impacts.some((i) => i.id === '수요'));
  for (let i = 1; i < r.impacts.length; i++) assert.ok(Math.abs(r.impacts[i - 1].score) >= Math.abs(r.impacts[i].score) - 1e-12);
  assert.ok(r.paths.length <= 3);
});

test('regime on/off: 평시엔 tightening·stress 엣지가 꺼져 있다', () => {
  const g = createGraph(fx);
  const normal = simulate(g, '금리', 1);
  assert.equal(imp(normal, '채권금리'), undefined);
  assert.equal(normal.regime, null);
  const tight = simulate(g, '금리', 1, { activeRegime: 'tightening' });
  assert.equal(imp(tight, '채권금리').sign, '+');
  assert.equal(tight.regime, 'tightening');
  assert.equal(imp(simulate(g, '위험심리', 1), '코스피변동'), undefined);
  assert.ok(imp(simulate(g, '위험심리', 1, { activeRegime: 'stress' }), '코스피변동'));
  assert.equal(imp(simulate(g, '위험심리', 1, { activeRegime: 'tightening' }), '코스피변동'), undefined);
});

test('edgeFilter는 국면 필터와 AND', () => {
  const g = createGraph(fx);
  const r = simulate(g, '금리', 1, { activeRegime: 'tightening', edgeFilter: (e) => e.id !== 'F9' });
  assert.equal(imp(r, '채권금리'), undefined);
});

test('강화·균형 루프 경고', () => {
  const g = createGraph(fx);
  const r = simulate(g, '수요', 1);
  const R = r.warnings.filter((w) => w.kind === 'loop-R');
  const B = r.warnings.filter((w) => w.kind === 'loop-B');
  assert.equal(R.length, 1);
  assert.deepEqual([...(R[0].edges ?? [])].sort(), ['F1', 'F2', 'F3']);
  assert.equal(B.length, 1);
  assert.deepEqual([...(B[0].edges ?? [])].sort(), ['F4', 'F5', 'F6']);
});

test('같은 루프는 한 번만, ± 루프는 생략', () => {
  const g = mk(['a', 'b'], [['a', 'b', '±'], ['b', 'a', '+']]);
  assert.equal(simulate(g, 'a', 1).warnings.filter((w) => w.kind.startsWith('loop')).length, 0);
  const g2 = mk(['a', 'b', 'c'], [['a', 'b', '+'], ['b', 'c', '+'], ['c', 'a', '+']]);
  assert.equal(simulate(g2, 'a', 1).warnings.filter((w) => w.kind === 'loop-R').length, 1);
});

test('공통원인 경고', () => {
  const g = mk(['c', 's', 't'], [['c', 's', '+'], ['c', 't', '+'], ['s', 't', '+']]);
  const r = simulate(g, 's', 1);
  const w = r.warnings.find((x) => x.kind === 'confounder');
  assert.ok(w);
  assert.deepEqual(w.nodes, ['c', 's', 't']);
  assert.match(w.message, /공통원인 가능/);
});

test('공통원인: start의 부모가 start를 거쳐서만 T에 닿으면 경고 아님', () => {
  const g = mk(['c', 's', 't'], [['c', 's', '+'], ['s', 't', '+']]);
  assert.equal(simulate(g, 's', 1).warnings.filter((x) => x.kind === 'confounder').length, 0);
});

test('cors는 전파에 쓰이지 않고 correlation-only 경고가 난다', () => {
  const g = createGraph(fx);
  const r = simulate(g, '주가', 1);
  assert.equal(imp(r, '환율'), undefined);
  const w = r.warnings.find((x) => x.kind === 'correlation-only');
  assert.ok(w);
  assert.deepEqual(w.nodes, ['주가', '환율']);
  assert.match(w.message, /상관만 있음\(인과 아님\)/);
  assert.ok(simulate(g, '환율', -1).warnings.some((x) => x.kind === 'correlation-only'));
});

test('인과 경로가 있는 cors 쌍은 correlation-only가 아니다', () => {
  const g = mk(['a', 'b'], [['a', 'b', '+']], [{ src: 'a', dst: 'b', r: 0.5 }]);
  assert.equal(simulate(g, 'a', 1).warnings.length, 0);
});

test('입력 비변경(deepFreeze)', () => {
  const data = deepFreeze(structuredClone(fx));
  const g = createGraph(data);
  for (const m of [g.nodes, g.edges, g.cors]) Object.freeze(m);
  assert.doesNotThrow(() => simulate(g, '수요', 1, { activeRegime: 'stress' }));
});

test('결정성: 같은 입력 → 깊은 동일 출력', () => {
  const g = createGraph(fx);
  assert.deepEqual(simulate(g, '수요', -1), simulate(g, '수요', -1));
  const rg = createGraph(migrate(structuredClone(real)));
  assert.deepEqual(simulate(rg, '미 10년물', 1), simulate(rg, '미 10년물', 1));
});

test('maxDepth: 기본 4, 상한 6', () => {
  const ids = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];
  const g = mk(ids, ids.slice(0, -1).map((id, i) => [id, ids[i + 1], '+']));
  assert.equal(simulate(g, 'n0', 1).impacts.length, 4);
  assert.equal(simulate(g, 'n0', 1, { maxDepth: 2 }).impacts.length, 2);
  assert.equal(simulate(g, 'n0', 1, { maxDepth: 99 }).impacts.length, 6);
  assert.equal(simulate(g, 'n0', 1, { maxDepth: 0 }).impacts.length, 1);
});

test('없는 start는 빈 결과, 경로 폭발 시 truncated', () => {
  const g = mk(['a'], []);
  assert.deepEqual(simulate(g, 'zz', 1).impacts, []);
  const ids = Array.from({ length: 9 }, (_, i) => `n${i}`);
  /** @type {[string,string,string][]} */
  const es = [];
  for (const a of ids) for (const b of ids) if (a !== b) es.push([a, b, '+']);
  const r = simulate(mk(ids, es), 'n0', 1, { maxDepth: 6 });
  assert.equal(r.truncated, true);
  assert.ok(r.impacts.length > 0);
  assert.equal(simulate(g, 'a', 1).truncated, undefined);
});

test('paths: 각 impact의 최상 경로가 ScoredPath로 들어간다', () => {
  const g = createGraph(fx);
  const r = simulate(g, '수요', 1);
  for (const p of r.paths) {
    assert.equal(p.nodes[0], '수요');
    assert.ok(typeof p.confidence === 'number' && typeof p.lagMonths === 'number');
  }
  const ends = new Set(r.paths.map((p) => p.nodes[p.nodes.length - 1]));
  for (const i of r.impacts) assert.ok(ends.has(i.id));
  assert.ok(r.paths.length <= 15);
});

test('실제 graph.json: 미 10년물·원/달러 +1, 예외 없음·1초 이내', () => {
  const g = createGraph(migrate(structuredClone(real)));
  for (const [name, sign] of /** @type {[string, 1|-1][]} */ ([['미 10년물', 1], ['원/달러', 1]])) {
    assert.ok(g.byId.has(name), name);
    const t0 = performance.now();
    const r = simulate(g, name, sign);
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, `${name} ${ms}ms`);
    assert.ok(r.impacts.length > 0);
    assert.ok(r.impacts.length <= 15);
  }
});
