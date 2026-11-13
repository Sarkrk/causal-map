// @ts-check
// 시뮬 UI: simHtml 순수 함수(이스케이프·라벨·경고·truncated)와 store sim 상태 왕복. 실행: node --test test/ui.simulate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGraph } from '../src/engine/graph.js';
import { simulate } from '../src/engine/simulate.js';
import { createStore, initialState } from '../src/store/store.js';
import { simHtml, simTabHtml, simTraceAt, simResult, SCORE_NOTE } from '../src/ui/simulate.js';

const EVIL = '<script>alert(1)</script>';

/**
 * 루프(R)·공통원인·상관만 경고가 모두 나오는 그래프. 노드 X의 이름에 스크립트를 넣는다.
 * s→x(+), x→s(+): R 루프. c→s, c→x: 공통원인. s–z 상관만.
 * @param {{lag?: string|null}} [o]
 */
function fixture(o = {}) {
  const lag = o.lag ?? null;
  const ids = ['s', 'x', 'c', 'z', 'y'];
  const names = { s: 'S노드', x: EVIL, c: 'C노드', z: 'Z노드', y: 'Y노드' };
  /** @type {[string,string,string][]} */
  const es = [['s', 'x', '+'], ['x', 's', '+'], ['c', 's', '+'], ['c', 'x', '+'], ['x', 'y', '-'], ['y', 's', '-']];
  return createGraph(/** @type {any} */ ({
    schemaVersion: 2,
    meta: {},
    nodes: ids.map((id) => ({ id, name: /** @type {any} */ (names)[id], cat: 'Other' })),
    edges: es.map(([src, dst, sign], i) => ({ id: `e${i}`, src, dst, sign, level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [], lag, regime: null })),
    cors: [{ src: 's', dst: 'z', r: 0.7 }],
  }));
}

test('simHtml: 노드명 이스케이프(스크립트 태그가 그대로 나오지 않는다)', () => {
  const g = fixture();
  const html = simHtml(simulate(g, 's', 1), g);
  assert.ok(!html.includes('<script>'), 'raw <script> 없음');
  assert.ok(html.includes('&lt;script&gt;'));
});

test('simHtml: 경고 메시지·시작 노드명도 이스케이프', () => {
  const g = fixture();
  const html = simHtml(simulate(g, 'x', 1), g);
  assert.ok(!html.includes('<script>'));
});

test("simHtml: '상대 점수' 라벨과 확률 아님 주석", () => {
  const g = fixture();
  const html = simHtml(simulate(g, 's', 1), g);
  assert.ok(html.includes('상대 점수'));
  assert.ok(html.includes(SCORE_NOTE));
  assert.ok(html.includes('확률 아님'));
  assert.ok(!html.includes('%'), '% 표기 없음');
});

test("simHtml: lag 없으면 '시차 미상', lag 있으면 개월 표기", () => {
  const unknown = fixture();
  assert.ok(simHtml(simulate(unknown, 's', 1), unknown).includes('시차 미상'));
  const known = fixture({ lag: 'short' });
  const h = simHtml(simulate(known, 's', 1), known);
  assert.ok(!h.includes('시차 미상'));
  assert.ok(h.includes('개월'));
});

test('simHtml: 경고 4종 라벨 + 클릭 속성', () => {
  const g = fixture();
  // 균형 루프(B)용: s→x(+), x→y(-), y→s(-)는 R(음 2개). B는 홀수 음수 필요 → 별도 그래프
  const gb = createGraph(/** @type {any} */ ({
    schemaVersion: 2,
    meta: {},
    nodes: ['p', 'q'].map((id) => ({ id, name: id, cat: 'Other' })),
    edges: [
      { id: 'b0', src: 'p', dst: 'q', sign: '+', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
      { id: 'b1', src: 'q', dst: 'p', sign: '-', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
    ],
    cors: [],
  }));
  const h1 = simHtml(simulate(g, 's', 1), g);
  const h2 = simHtml(simulate(gb, 'p', 1), gb);
  assert.ok(h1.includes('강화 루프'));
  assert.ok(h1.includes('공통원인 가능'));
  assert.ok(h1.includes('상관만 있음(인과 아님)'));
  assert.ok(h2.includes('균형 루프'));
  assert.ok(h1.includes('data-act="simtrace" data-kind="warn"'));
  assert.ok(h1.includes('data-act="simtrace" data-kind="path"'));
});

test('simHtml: truncated 표시는 truncated일 때만', () => {
  const g = fixture();
  const r = simulate(g, 's', 1);
  assert.ok(!simHtml(r, g).includes('일부만 계산'));
  assert.ok(simHtml({ ...r, truncated: true }, g).includes('경로가 많아 일부만 계산'));
});

test('simHtml: 경로 신뢰도·가장 약한 등급 표시, 영향 없음 메시지', () => {
  const g = fixture();
  const r = simulate(g, 's', 1);
  const h = simHtml(r, g);
  assert.ok(h.includes('경로 신뢰도'));
  assert.ok(h.includes('가장 약한 등급'));
  assert.ok(simHtml({ ...r, impacts: [], paths: [], warnings: [] }, g).includes('전파되는 노드가 없습니다'));
});

/** 선택·실행까지 간 상태 */
function ran() {
  const g = fixture();
  const st = createStore(initialState(['Other']), { storage: undefined, nodeIds: g.nodes.map((n) => n.id) });
  st.dispatch({ type: 'select', id: 's' });
  st.dispatch({ type: 'setTab', tab: 'sim' });
  st.dispatch({ type: 'runSim' });
  return { g, st };
}

test('simTabHtml: 폼에 국면 7종(평시 가정 + 6)·깊이 2~6, 실행 전에는 안내', () => {
  const g = fixture();
  const st = createStore(initialState(['Other']), { storage: undefined });
  st.dispatch({ type: 'select', id: 's' });
  const h = simTabHtml(g, st.get());
  for (const label of ['평시', '위기·꼬리위험', '긴축', '완화', '침체', '확장', '평시 가정']) assert.ok(h.includes(label), label);
  assert.equal((h.match(/<option value="\d">/g) ?? []).length + (h.match(/<option value="\d" selected>/g) ?? []).length, 5);
  assert.ok(h.includes('실행'));
  assert.ok(!h.includes('상대 점수'));
});

test('simTabHtml·simTraceAt: 실행 후 결과와 trace 해석', () => {
  const { g, st } = ran();
  const s = st.get();
  assert.ok(simTabHtml(g, s).includes('상대 점수'));
  assert.equal(simResult(g, s), simResult(g, s), '메모이즈');
  const tp = simTraceAt(g, s, 'path', 0);
  assert.ok(tp && tp.nodes[0] === 's' && tp.kind === 'path');
  const tw = simTraceAt(g, s, 'warn', 0);
  assert.ok(tw && tw.nodes.length >= 2);
  assert.equal(simTraceAt(g, s, 'path', 999), null);
  assert.equal(simTraceAt(g, s, 'nope', 0), null);
  st.dispatch({ type: 'setTrace', trace: /** @type {any} */ (tp) });
  assert.ok(simTabHtml(g, st.get()).includes('class="it on"'));
});

/** 간이 저장소 */
function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (/** @type {string} */ k) => (map.has(k) ? map.get(k) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void map.set(k, v),
  };
}
const IDS = ['a', 'b'];

test('store sim: 탭 전환해도 입력 유지', () => {
  const s = createStore(initialState(['Other']), { storage: undefined, nodeIds: IDS });
  s.dispatch({ type: 'select', id: 'a' });
  s.dispatch({ type: 'setSim', patch: { sign: -1, regime: 'stress', depth: 5 } });
  s.dispatch({ type: 'runSim' });
  for (const tab of /** @type {const} */ (['sim', 'map', 'in', 'loop', 'path', 'sim'])) s.dispatch({ type: 'setTab', tab });
  assert.deepEqual(s.get().view.sim, { start: 'a', sign: -1, regime: 'stress', depth: 5 });
});

test('store sim: 입력을 바꾸면 결과 무효(start=null), runSim은 선택 노드로', () => {
  const s = createStore(initialState(['Other']), { storage: undefined, nodeIds: IDS });
  s.dispatch({ type: 'runSim' });
  assert.equal(s.get().view.sim.start, null, '선택 없으면 실행 안 됨');
  s.dispatch({ type: 'select', id: 'a' });
  s.dispatch({ type: 'runSim' });
  assert.equal(s.get().view.sim.start, 'a');
  s.dispatch({ type: 'setSim', patch: { depth: 3 } });
  assert.equal(s.get().view.sim.start, null);
  assert.equal(s.get().view.sim.depth, 3);
});

test('store sim: 잘못된 입력은 무시', () => {
  const s = createStore(initialState(['Other']), { storage: undefined, nodeIds: IDS });
  s.dispatch({ type: 'setSim', patch: { sign: 0, regime: 'bogus', depth: 9 } });
  assert.deepEqual(s.get().view.sim, { start: null, sign: 1, regime: null, depth: 4 });
  s.dispatch({ type: 'setSim', patch: { depth: 2.5 } });
  assert.equal(s.get().view.sim.depth, 4);
  s.dispatch({ type: 'setSim', patch: { regime: 'easing' } });
  s.dispatch({ type: 'setSim', patch: { regime: null } });
  assert.equal(s.get().view.sim.regime, null);
});

test('store sim: persist 왕복, 알 수 없는 노드는 버림', () => {
  const st = fakeStorage();
  const s = createStore(initialState(['Other']), { storage: st, nodeIds: IDS });
  s.dispatch({ type: 'select', id: 'a' });
  s.dispatch({ type: 'setSim', patch: { sign: -1, regime: 'tightening', depth: 6 } });
  s.dispatch({ type: 'runSim' });
  const again = createStore(initialState(['Other']), { storage: st, nodeIds: IDS });
  assert.deepEqual(again.get().view.sim, { start: 'a', sign: -1, regime: 'tightening', depth: 6 });
  const other = createStore(initialState(['Other']), { storage: st, nodeIds: ['b'] });
  assert.deepEqual(other.get().view.sim, { start: null, sign: -1, regime: 'tightening', depth: 6 });
  const noIds = createStore(initialState(['Other']), { storage: st });
  assert.equal(noIds.get().view.sim.start, null);
});

test('store sim: 깨진 저장본은 기본값', () => {
  const bad = [
    { view: { sim: { start: 5, sign: 2, regime: 'zzz', depth: 99 } } },
    { view: { sim: 'x' } },
    { view: { sim: { depth: 3.5, sign: '1' } } },
  ];
  for (const v of bad) {
    const st = fakeStorage();
    st.setItem('cg_view', JSON.stringify(v));
    const s = createStore(initialState(['Other']), { storage: st, nodeIds: IDS });
    assert.deepEqual(s.get().view.sim, { start: null, sign: 1, regime: null, depth: 4 });
  }
});

test('store sim: reduce가 이전 상태를 바꾸지 않는다', () => {
  const s = createStore(initialState(['Other']), { storage: undefined, nodeIds: IDS });
  s.dispatch({ type: 'select', id: 'a' });
  const before = s.get();
  const snap = JSON.stringify(before);
  s.dispatch({ type: 'setSim', patch: { sign: -1 } });
  s.dispatch({ type: 'runSim' });
  assert.equal(JSON.stringify(before), snap);
});

test('simHtml 시차 문구: 전부 known / 혼합 / 전부 미상 / 즉시', () => {
  /** @param {[string,string,string|null][]} es */
  const mkg = (es) => createGraph(/** @type {any} */ ({
    schemaVersion: 2,
    meta: {},
    nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, cat: 'Other' })),
    edges: es.map(([src, dst, lag], i) => ({ id: `e${i}`, src, dst, sign: '+', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [], lag, regime: null })),
    cors: [],
  }));
  /** @param {any} g @param {string} id */
  const meta = (g, id) => {
    const r = simulate(g, 'a', 1);
    return simHtml({ ...r, impacts: r.impacts.filter((i) => i.id === id) }, g);
  };
  const known = meta(mkg([['a', 'b', 'medium']]), 'b');
  assert.ok(known.includes('약 7개월'));
  assert.ok(!known.includes('시차 미상'));
  const mixed = meta(mkg([['a', 'b', 'short'], ['a', 'c', null], ['c', 'b', 'short']]), 'b');
  assert.ok(mixed.includes('약 2개월 · 일부 경로 시차 미상'));
  const unk = meta(mkg([['a', 'b', null]]), 'b');
  assert.ok(unk.includes('시차 미상'));
  assert.ok(!unk.includes('약 '));
  assert.ok(meta(mkg([['a', 'b', 'immediate']]), 'b').includes('즉시~1개월 미만'));
});
