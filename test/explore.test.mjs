// @ts-check
// 루프·경로 탭(explore.js)과 캔버스 강조 집합(select.js emphasis) 테스트. 실행: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v1 from './fixtures/graph.v1.json' with { type: 'json' };
import { createGraph } from '../src/engine/graph.js';
import { findLoops, polarity } from '../src/engine/cycles.js';
import { findPaths } from '../src/engine/paths.js';
import { createStore, initialState } from '../src/store/store.js';
import { emphasis, visible } from '../src/store/select.js';
import {
  createExplore,
  loopTabHtml,
  pathBoxHtml,
  pathListHtml,
  suggestHtml,
  traceOf,
  sameTrace,
  traceAt,
} from '../src/ui/explore.js';

/** @typedef {import('../src/store/store.js').AppState} AppState */

const graph = createGraph(/** @type {any} */ (v1));
const cats = [...new Set(graph.nodes.map((n) => n.cat))];

/** @param {Partial<AppState['view']>} [view] @returns {AppState} */
function stateWith(view = {}) {
  const st = initialState(cats);
  return { ...st, view: { ...st.view, ...view } };
}

/** 가시 노드가 가장 많이 연결된 노드(루프가 있을 가능성이 큰 노드)를 고른다. */
function busiestId() {
  let best = graph.nodes[0].id;
  let bestDeg = -1;
  for (const n of graph.nodes) {
    const d = (graph.outE.get(n.id) ?? []).length + graph.edges.filter((e) => e.dst === n.id).length;
    if (d > bestDeg) {
      bestDeg = d;
      best = n.id;
    }
  }
  return best;
}

test('loop tab: 항목 수·극성 배지·data-act 존재', () => {
  const sel = busiestId();
  const st = stateWith({ selected: sel, tab: 'loop' });
  const explore = createExplore();
  const loops = explore.loops(graph, st);
  const expect = findLoops(graph, sel, { maxLen: 4, limit: 30, filter: () => true });
  assert.equal(loops.length, expect.length, '엔진 결과와 항목 수가 같다');

  const html = loopTabHtml(graph, st);
  const items = html.match(/data-act="trace"/g) ?? [];
  assert.equal(items.length, loops.length);
  if (loops.length === 0) {
    assert.ok(html.includes('순환 고리가 없습니다'));
  } else {
    assert.match(html, /R 강화|B 균형|\? 조건부/);
    assert.ok(html.includes('data-kind="loop" data-idx="0"'));
    assert.match(html, /\d단계/);
  }
});

test('loop tab: 선택이 없으면 빈 목록', () => {
  assert.deepEqual(createExplore().loops(graph, stateWith({ selected: null })), []);
});

test('path tab: pathTo 없으면 입력창과 안내만', () => {
  const sel = busiestId();
  const st = stateWith({ selected: sel, tab: 'path', pathTo: null });
  const html = pathBoxHtml(graph, st);
  assert.ok(html.includes('id="pq"'));
  assert.ok(html.includes('data-part="plist"'));
  assert.ok(!html.includes('data-act="trace"'));
  assert.ok(pathListHtml(graph, st).includes('도착 노드를 검색해 고르세요'));
});

test('path tab: 항목·부호 배지·data-act, 0개면 안내 문구', () => {
  const ids = graph.nodes.map((n) => n.id);
  let from = '', to = '';
  // 경로가 실제로 있는 쌍을 찾는다
  outer: for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      if (findPaths(graph, a, b, { maxLen: 4, k: 10, filter: () => true }).length > 0) {
        from = a;
        to = b;
        break outer;
      }
    }
  }
  assert.ok(from, 'fixture에 4단계 이하 경로가 있어야 한다');
  const st = stateWith({ selected: from, pathTo: to, tab: 'path' });
  const html = pathListHtml(graph, st);
  assert.match(html, /순효과 (\+|−|±)/);
  assert.ok(html.includes('data-act="trace"'));
  assert.ok(html.includes('data-act="pathrev"'));

  const none = pathListHtml(graph, stateWith({ selected: from, pathTo: from }));
  assert.ok(none.includes('연결 경로가 없습니다'));
});

test('suggest: 부분 일치, 선택 노드 제외, 최대 8개', () => {
  const sel = graph.nodes[0].id;
  const html = suggestHtml(graph, '', sel);
  assert.equal(html, '');
  const all = suggestHtml(graph, ' ', sel);
  assert.equal(all, '');
  const q = graph.nodes[0].name.slice(0, 1);
  const out = suggestHtml(graph, q, sel);
  const cnt = (out.match(/data-act="pathto"/g) ?? []).length;
  assert.ok(cnt <= 8);
  assert.ok(!out.includes(`data-id="${sel}"`));
});

test('메모이즈: 같은 키 두 번 호출하면 엔진은 한 번만 돈다', () => {
  let loopCalls = 0;
  let pathCalls = 0;
  const explore = createExplore({
    findLoops: (...a) => {
      loopCalls++;
      return findLoops(...a);
    },
    findPaths: (...a) => {
      pathCalls++;
      return findPaths(...a);
    },
  });
  const sel = busiestId();
  const st = stateWith({ selected: sel, tab: 'loop' });
  explore.loops(graph, st);
  explore.loops(graph, st);
  explore.loops(graph, { ...st, view: { ...st.view, tab: 'in' } });
  assert.equal(loopCalls, 1, '탭만 바뀌면 재계산하지 않는다');

  const other = graph.nodes.find((n) => n.id !== sel)?.id ?? sel;
  const pst = stateWith({ selected: sel, pathTo: other, tab: 'path' });
  explore.paths(graph, pst);
  explore.paths(graph, pst);
  assert.equal(pathCalls, 1);

  // 필터가 바뀌면 키가 달라져 다시 계산한다
  explore.loops(graph, { ...st, filters: { ...st.filters, thr: 0.5 } });
  assert.equal(loopCalls, 2);
});

test('방향 반전: paths()가 view.pathRev에 따라 sel↔to를 뒤집는다', () => {
  const explore = createExplore();
  const ids = graph.nodes.map((n) => n.id);
  const a = ids[0];
  const b = ids[1];
  const st = stateWith({ selected: a, pathTo: b });
  assert.equal(explore.paths(graph, st)?.from, a);
  const rv = explore.paths(graph, stateWith({ selected: a, pathTo: b, pathRev: true }));
  assert.equal(rv?.from, b);
  assert.equal(rv?.to, a);
});

test('trace: traceOf·sameTrace·traceAt가 항목을 일관되게 해석한다', () => {
  const sel = busiestId();
  const st = stateWith({ selected: sel, tab: 'loop' });
  const first = traceAt(graph, st, 'loop', 0);
  assert.ok(first, '0번 항목이 있어야 한다');
  assert.equal(first.kind, 'loop');
  assert.ok(sameTrace(first, traceOf('loop', findLoops(graph, sel, { maxLen: 4, limit: 30, filter: () => true })[0])));
  assert.equal(sameTrace(first, null), false);
  assert.equal(traceAt(graph, st, 'loop', 9999), null);
  assert.equal(traceAt(graph, st, 'bogus', 0), null);
});

test('emphasis: trace 없으면 highlight 결과(edgeIds null), 있으면 trace 집합', () => {
  const sel = busiestId();
  const base = stateWith({ selected: sel, hop: 1, dir: 'both' });
  const vis = visible(graph, base);
  const em0 = emphasis(graph, base, vis);
  assert.ok(em0);
  assert.equal(em0.edgeIds, null);
  assert.ok(em0.nodes.has(sel));

  assert.equal(emphasis(graph, stateWith({ selected: null }), vis), null);

  const loop = findLoops(graph, sel, { maxLen: 4, limit: 30, filter: () => true })[0];
  if (!loop) return; // 이 fixture에 루프가 없으면 아래 검사는 생략
  const trace = traceOf('loop', loop);
  const withTrace = stateWith({ selected: sel, trace });
  const em1 = emphasis(graph, withTrace, visible(graph, withTrace));
  assert.ok(em1);
  assert.deepEqual([...em1.nodes].sort(), [...new Set(loop.nodes)].sort());
  assert.deepEqual([...(em1.edgeIds ?? [])].sort(), trace.edges.slice().sort());
  // trace가 선택 노드 없이도 강조를 준다
  const noSel = stateWith({ selected: null, trace });
  assert.ok(emphasis(graph, noSel, visible(graph, noSel)));
});

test('store: setTrace·setPathTo는 trace를 채우고 지운다', () => {
  const st = createStore(initialState(cats), { storage: { getItem: () => null, setItem() {} } });
  st.dispatch({ type: 'select', id: busiestId() });
  st.dispatch({ type: 'setTrace', trace: { kind: 'loop', nodes: ['a'], edges: ['E1'] } });
  assert.equal(st.get().view.trace?.kind, 'loop');
  st.dispatch({ type: 'setPathTo', id: 'x' });
  assert.equal(st.get().view.trace, null);
});
