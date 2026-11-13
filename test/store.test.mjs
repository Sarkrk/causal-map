// store·선택자 테스트. 실행: node --test test/store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, initialState } from '../src/store/store.js';
import { visible, causalVisible, highlight } from '../src/store/select.js';
import { categoriesPresent } from '../src/store/labels.js';
import { createGraph } from '../src/engine/graph.js';
import { neighborhood } from '../src/engine/traverse.js';

const RAW = JSON.parse(readFileSync(new URL('./fixtures/graph.v1.json', import.meta.url), 'utf8'));

/** @returns {{getItem:(k:string)=>string|null,setItem:(k:string,v:string)=>void,map:Map<string,string>}} */
function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const graph = createGraph(RAW);
const cats = categoriesPresent(graph);
const fresh = (storage = fakeStorage()) => createStore(initialState(cats), { storage });

test('초기값은 원본 기본값과 같다', () => {
  const st = fresh().get();
  assert.deepEqual(st.filters.levels, ['A', 'B', 'C', 'D']);
  assert.deepEqual(st.filters.cats, cats);
  assert.equal(st.filters.thr, 0);
  assert.equal(st.filters.showNR, true);
  assert.equal(st.filters.showCor, false);
  assert.deepEqual(st.prefs, { labAll: false, hideOrph: true, autoSpin: true, wobble: true });
  assert.deepEqual(st.view, { selected: null, hop: 1, dir: 'both', tab: 'in', flatAll: false, trace: null, pathTo: null, pathRev: false, pathQuery: '', search: '' });
});

test('각 action이 상태를 바꾸고 이전 객체는 그대로 둔다', () => {
  const s = fresh();
  const before = s.get();
  s.dispatch({ type: 'toggleLevel', level: 'D' });
  assert.deepEqual(s.get().filters.levels, ['A', 'B', 'C']);
  assert.deepEqual(before.filters.levels, ['A', 'B', 'C', 'D']);
  s.dispatch({ type: 'toggleLevel', level: 'D' });
  assert.deepEqual(s.get().filters.levels, ['A', 'B', 'C', 'D']);

  s.dispatch({ type: 'toggleCat', cat: cats[0] });
  assert.equal(s.get().filters.cats.includes(cats[0]), false);
  s.dispatch({ type: 'toggleCat', cat: cats[0] });
  assert.equal(s.get().filters.cats.includes(cats[0]), true);

  s.dispatch({ type: 'setThr', value: 0.3 });
  assert.equal(s.get().filters.thr, 0.3);
  s.dispatch({ type: 'setThr', value: 9 });
  assert.equal(s.get().filters.thr, 1);
  s.dispatch({ type: 'setThr', value: NaN });
  assert.equal(s.get().filters.thr, 1);

  s.dispatch({ type: 'toggle', key: 'showCor' });
  assert.equal(s.get().filters.showCor, true);
  s.dispatch({ type: 'toggle', key: 'wobble' });
  assert.equal(s.get().prefs.wobble, false);

  s.dispatch({ type: 'setHop', hop: 2 });
  assert.equal(s.get().view.hop, 2);
  s.dispatch({ type: 'setDir', dir: 'up' });
  assert.equal(s.get().view.dir, 'up');
  s.dispatch({ type: 'setTab', tab: 'out' });
  assert.equal(s.get().view.tab, 'out');
  s.dispatch({ type: 'toggleFlatAll' });
  assert.equal(s.get().view.flatAll, true);
});

test('select는 탭을 map으로, flatAll을 끈다. deselect는 선택만 지운다', () => {
  const s = fresh();
  s.dispatch({ type: 'setTab', tab: 'cor' });
  s.dispatch({ type: 'toggleFlatAll' });
  s.dispatch({ type: 'select', id: '유가' });
  assert.equal(s.get().view.selected, '유가');
  assert.equal(s.get().view.tab, 'map');
  assert.equal(s.get().view.flatAll, false);
  s.dispatch({ type: 'deselect' });
  assert.equal(s.get().view.selected, null);
});

test('잘못된 action은 예외', () => {
  const s = fresh();
  assert.throws(() => s.dispatch({ type: 'nope' }));
  assert.throws(() => s.dispatch({ type: 'toggle', key: 'bogus' }));
});

test('subscribe는 (state, prev, action)을 받고 해제할 수 있다', () => {
  const s = fresh();
  const seen = [];
  const off = s.subscribe((st, prev, action) => seen.push([st.view.hop, prev.view.hop, action.type]));
  s.dispatch({ type: 'setHop', hop: 2 });
  off();
  s.dispatch({ type: 'setHop', hop: 1 });
  assert.deepEqual(seen, [[2, 1, 'setHop']]);
});

test('filters·prefs·hop·dir만 저장하고 selected·tab·flatAll은 저장하지 않는다', () => {
  const st = fakeStorage();
  const s = fresh(st);
  s.dispatch({ type: 'toggleLevel', level: 'C' });
  s.dispatch({ type: 'setHop', hop: 2 });
  s.dispatch({ type: 'setDir', dir: 'down' });
  s.dispatch({ type: 'select', id: '유가' });
  s.dispatch({ type: 'setTab', tab: 'out' });
  const saved = JSON.parse(st.map.get('cg_view'));
  assert.deepEqual(Object.keys(saved).sort(), ['filters', 'prefs', 'view']);
  assert.deepEqual(saved.view, { hop: 2, dir: 'down', pathTo: null, pathRev: false, pathQuery: '', search: '' });
  assert.deepEqual(saved.filters.levels, ['A', 'B', 'D']);
  assert.equal('selected' in saved.view, false);
});

test('저장된 값이 있으면 복원한다', () => {
  const stored = {
    cg_view: JSON.stringify({
      filters: { levels: ['A'], cats: cats.slice(0, 2), thr: 0.2, showNR: false, showCor: true },
      prefs: { labAll: true, hideOrph: false, autoSpin: false, wobble: false },
      view: { hop: 2, dir: 'up' },
    }),
  };
  const st = fresh(fakeStorage(stored)).get();
  assert.deepEqual(st.filters.levels, ['A']);
  assert.equal(st.filters.thr, 0.2);
  assert.equal(st.filters.showCor, true);
  assert.equal(st.prefs.labAll, true);
  assert.equal(st.view.hop, 2);
  assert.equal(st.view.dir, 'up');
  assert.equal(st.view.selected, null);
});

test('깨진 저장값은 무시하고 기본값을 쓴다', () => {
  const cases = [
    '{not json',
    'null',
    '[1,2]',
    JSON.stringify({ filters: { levels: ['Z'], thr: 5, cats: ['Nope'] }, view: { hop: 7, dir: 'sideways' } }),
  ];
  for (const raw of cases) {
    const st = fresh(fakeStorage({ cg_view: raw })).get();
    assert.deepEqual(st.filters.levels, ['A', 'B', 'C', 'D'], raw);
    assert.equal(st.filters.thr, 0, raw);
    assert.equal(st.view.hop, 1, raw);
    assert.equal(st.view.dir, 'both', raw);
  }
});

test('저장소가 예외를 던져도 화면 상태는 동작한다', () => {
  const bad = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  const s = createStore(initialState(cats), { storage: bad });
  s.dispatch({ type: 'setHop', hop: 2 });
  assert.equal(s.get().view.hop, 2);
});

test('visible: 기본 필터에서 v1 fixture는 노드 83·인과 245', () => {
  const v = visible(graph, fresh().get());
  assert.equal(v.nodes.size, 83);
  assert.equal(v.causal.length, 245);
  assert.equal(v.cors.length, 0);
});

test('visible: 상관선을 켜면 상관 엣지가 포함된다', () => {
  const s = fresh();
  s.dispatch({ type: 'toggle', key: 'showCor' });
  const v = visible(graph, s.get());
  assert.equal(v.causal.length, 245);
  assert.equal(v.cors.length, graph.cors.length);
});

test('visible: 등급 필터를 끄면 그 등급 엣지가 빠진다', () => {
  const s = fresh();
  s.dispatch({ type: 'toggleLevel', level: 'C' });
  const v = visible(graph, s.get());
  assert.equal(v.causal.length, 245 - graph.edges.filter((e) => e.level === 'C').length);
  assert.ok(v.causal.every((e) => e.level !== 'C'));
});

test('causalVisible: |r| 임계와 r=null 처리', () => {
  const s = fresh();
  s.dispatch({ type: 'setThr', value: 0.5 });
  const f = s.get().filters;
  const withR = graph.edges.find((e) => e.r != null && Math.abs(e.r) < 0.5);
  if (withR) assert.equal(causalVisible(graph, withR, f), false);
  const noR = graph.edges.find((e) => e.r == null);
  if (noR) assert.equal(causalVisible(graph, noR, f), true);
  s.dispatch({ type: 'toggle', key: 'showNR' });
  if (noR) assert.equal(causalVisible(graph, noR, s.get().filters), false);
});

test('highlight: both(상관 꺼짐)는 엔진 neighborhood와 같다', () => {
  const st = fresh().get();
  const v = visible(graph, st, '유가');
  const sel = '유가';
  for (const hop of [1, 2]) {
    const got = highlight(graph, sel, hop, 'both', st.filters, v);
    const want = neighborhood(graph, sel, hop, 'both', (e) => causalVisible(graph, e, st.filters));
    assert.deepEqual([...got].sort(), [...want].sort(), `hop ${hop}`);
  }
});

test('highlight: up/down은 both의 부분집합이고 선택 노드를 포함한다', () => {
  const st = fresh().get();
  const v = visible(graph, st, '유가');
  const both = highlight(graph, '유가', 1, 'both', st.filters, v);
  const up = highlight(graph, '유가', 1, 'up', st.filters, v);
  const down = highlight(graph, '유가', 1, 'down', st.filters, v);
  assert.ok(up.has('유가') && down.has('유가'));
  assert.ok([...up].every((x) => both.has(x)));
  assert.ok([...down].every((x) => both.has(x)));
});

test('highlight: 상관선이 켜지면 both가 상관 이웃도 포함한다', () => {
  const s = fresh();
  s.dispatch({ type: 'toggle', key: 'showCor' });
  const st = s.get();
  const cor = graph.cors[0];
  const v = visible(graph, st, cor.src);
  const got = highlight(graph, cor.src, 1, 'both', st.filters, v);
  assert.ok(got.has(cor.dst));
});
