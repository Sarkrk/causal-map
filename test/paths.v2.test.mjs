// @ts-check
// 경로 점수·정렬·국면 필터 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGraph } from '../src/engine/graph.js';
import { scorePath, findScoredPaths, findPaths } from '../src/engine/paths.js';
import { regimeFilter } from '../src/engine/regime.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/graph.v2.json', import.meta.url), 'utf8'));

/** @param {any} o */
const E = (o) => ({ id: 'x', src: 'a', dst: 'b', sign: '+', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [], lag: null, regime: null, ...o });
/** @param {any[]} edges */
const P = (edges) => ({ nodes: ['a'], edges, sign: /** @type {'+'} */ ('+') });

test('scorePath: confidence = 등급 가중치 곱, lagMonths = 합, minLevel = 최약', () => {
  const s = scorePath(P([E({ level: 'A', lag: 'short' }), E({ level: 'B', lag: 'medium' }), E({ level: 'C', lag: 'immediate' })]));
  assert.ok(Math.abs(s.confidence - 1 * 0.75 * 0.5) < 1e-12);
  assert.equal(s.lagMonths, 2 + 7 + 0);
  assert.equal(s.unknownLags, 0);
  assert.equal(s.minLevel, 'C');
});

test('scorePath: lag null은 0으로 더하고 unknownLags 증가', () => {
  const s = scorePath(P([E({ lag: null }), E({ lag: 'long' }), E({ lag: null, level: 'D' })]));
  assert.equal(s.lagMonths, 18);
  assert.equal(s.unknownLags, 2);
  assert.equal(s.minLevel, 'D');
  assert.ok(Math.abs(s.confidence - 0.25) < 1e-12);
});

test('scorePath: 빈 경로, 입력 비변경', () => {
  const s = scorePath(P([]));
  assert.equal(s.confidence, 1);
  assert.equal(s.minLevel, 'A');
  const p = P([E({})]);
  Object.freeze(p.edges);
  Object.freeze(p);
  assert.doesNotThrow(() => scorePath(p));
});

/** regimeFilter 진리표 */
for (const [active, regime, want] of /** @type {[any, any, boolean][]} */ ([
  [null, null, true],
  [null, 'normal', true],
  [null, 'stress', false],
  [undefined, 'tightening', false],
  ['stress', null, true],
  ['stress', 'stress', true],
  ['stress', 'normal', false],
  ['stress', 'tightening', false],
  ['normal', 'normal', true],
])) {
  test(`regimeFilter(${active}) edge.regime=${regime} → ${want}`, () => {
    assert.equal(regimeFilter(active)(E({ regime })), want);
  });
}

test('regimeFilter: regime 키가 없는 엣지는 상시 활성', () => {
  const e = E({});
  delete e.regime;
  assert.equal(regimeFilter('stress')(e), true);
});

/** a→d 로 가는 여러 경로 */
function diamond() {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id, cat: 'Other' }));
  const edges = [
    E({ id: '1', src: 'a', dst: 'd', level: 'C', lag: 'immediate' }), // conf .5, lag 0, len 1
    E({ id: '2', src: 'a', dst: 'b', level: 'A', lag: 'short' }),
    E({ id: '3', src: 'b', dst: 'd', level: 'A', lag: 'short' }), // conf 1, lag 4, len 2
    E({ id: '4', src: 'a', dst: 'c', level: 'A', lag: 'immediate' }),
    E({ id: '5', src: 'c', dst: 'd', level: 'A', lag: 'long' }), // conf 1, lag 18, len 2
    E({ id: '6', src: 'a', dst: 'e', level: 'A', lag: 'immediate' }),
    E({ id: '7', src: 'e', dst: 'd', level: 'A', lag: 'immediate', regime: 'stress' }), // 평시엔 비활성
  ];
  return createGraph(/** @type {any} */ ({ schemaVersion: 2, meta: {}, nodes, edges, cors: [] }));
}

test('findScoredPaths: confidence↓ → lag↑ → 길이 → 노드열, 평시엔 stress 엣지 제외', () => {
  const g = diamond();
  const r = findScoredPaths(g, 'a', 'd', { maxLen: 3 });
  assert.deepEqual(r.map((p) => p.nodes.join('')), ['abd', 'acd', 'ad']);
  assert.deepEqual(r.map((p) => p.confidence), [1, 1, 0.5]);
});

test('findScoredPaths: activeRegime=stress면 stress 엣지 경로 포함(lag 0이라 먼저)', () => {
  const g = diamond();
  const r = findScoredPaths(g, 'a', 'd', { maxLen: 3, activeRegime: 'stress' });
  assert.deepEqual(r.map((p) => p.nodes.join('')), ['aed', 'abd', 'acd', 'ad']);
});

test('findScoredPaths: k 절단은 정렬 뒤에 적용, 결정적', () => {
  const g = diamond();
  const r1 = findScoredPaths(g, 'a', 'd', { maxLen: 3, k: 1 });
  assert.deepEqual(r1.map((p) => p.nodes.join('')), ['abd']);
  assert.deepEqual(findScoredPaths(g, 'a', 'd', { maxLen: 3 }), findScoredPaths(g, 'a', 'd', { maxLen: 3 }));
});

test('findScoredPaths: opts.filter와 AND, 기존 findPaths는 국면을 보지 않음', () => {
  const g = diamond();
  const r = findScoredPaths(g, 'a', 'd', { maxLen: 3, filter: (e) => e.id !== '3' });
  assert.deepEqual(r.map((p) => p.nodes.join('')), ['acd', 'ad']);
  assert.equal(findPaths(g, 'a', 'd', { maxLen: 3 }).length, 4);
});

test('findScoredPaths: 픽스처 금리→기업이익 경로 점수', () => {
  const g = createGraph(fx);
  const r = findScoredPaths(g, '금리', '기업이익');
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].nodes, ['금리', '수요', '기업이익']);
  assert.equal(r[0].sign, '-');
  assert.equal(r[0].lagMonths, 18 + 2);
});
