// @ts-check
// 상태 영속성: 탭 왕복 유지, 저장→복원, 잘못된 저장본, reduce 입력 비변경. 실행: node --test test/store.persist.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, initialState } from '../src/store/store.js';

const CATS = ['macro', 'market'];
const IDS = ['a', 'b', 'c'];

function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (/** @type {string} */ k) => (map.has(k) ? /** @type {string} */ (map.get(k)) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void map.set(k, String(v)),
  };
}

const mk = (storage = fakeStorage(), nodeIds = IDS) => createStore(initialState(CATS), { storage, nodeIds });

/** 경로 탭 상태를 만든다: a 선택 → path 탭 → 도착 b → 반전 → 검색어 */
function pathState(s) {
  s.dispatch({ type: 'select', id: 'a' });
  s.dispatch({ type: 'setTab', tab: 'path' });
  s.dispatch({ type: 'setPathTo', id: 'b' });
  s.dispatch({ type: 'togglePathRev' });
  s.dispatch({ type: 'setPathQuery', value: '금리' });
  s.dispatch({ type: 'setSearch', value: '환율' });
}

test('탭 왕복 후 pathTo·반전·검색어가 유지된다', () => {
  const s = mk();
  pathState(s);
  for (const tab of ['map', 'in', 'out', 'cor', 'loop', 'path']) s.dispatch({ type: 'setTab', tab });
  const v = s.get().view;
  assert.equal(v.pathTo, 'b');
  assert.equal(v.pathRev, true);
  assert.equal(v.pathQuery, '금리');
  assert.equal(v.search, '환율');
});

test('도착 노드가 바뀌면 반전은 정방향으로, 같은 도착을 다시 지정하면 유지', () => {
  const s = mk();
  pathState(s);
  s.dispatch({ type: 'setPathTo', id: 'b' });
  assert.equal(s.get().view.pathRev, true);
  s.dispatch({ type: 'setPathTo', id: 'c' });
  assert.equal(s.get().view.pathRev, false);
});

test('다른 노드를 선택하면 경로 상태는 초기화되지만 상단 검색어는 남는다', () => {
  const s = mk();
  pathState(s);
  s.dispatch({ type: 'select', id: 'c' });
  const v = s.get().view;
  assert.deepEqual([v.pathTo, v.pathRev, v.pathQuery], [null, false, '']);
  assert.equal(v.search, '환율');
});

test('restoreView: 같은 쌍이면 반전·검색어 유지, 다른 쌍이면 초기화', () => {
  const s = mk();
  pathState(s);
  s.dispatch({ type: 'restoreView', selected: 'a', tab: 'path', pathTo: 'b' });
  assert.equal(s.get().view.pathRev, true);
  assert.equal(s.get().view.pathQuery, '금리');
  s.dispatch({ type: 'restoreView', selected: 'a', tab: 'path', pathTo: 'c' });
  assert.equal(s.get().view.pathRev, false);
  assert.equal(s.get().view.pathQuery, '');
});

test('저장→복원 왕복', () => {
  const st = fakeStorage();
  pathState(mk(st));
  const r = mk(st).get().view;
  assert.equal(r.pathTo, 'b');
  assert.equal(r.pathRev, true);
  assert.equal(r.pathQuery, '금리');
  assert.equal(r.search, '환율');
  assert.equal(r.selected, null, 'selected는 저장하지 않는다');
  assert.equal(r.tab, 'in', 'tab은 저장하지 않는다');
});

test('저장본의 알 수 없는 노드 id는 복원 때 버린다(반전도 함께)', () => {
  const st = fakeStorage();
  pathState(mk(st));
  const r = mk(st, ['a', 'c']).get().view;
  assert.equal(r.pathTo, null);
  assert.equal(r.pathRev, false);
  // nodeIds를 안 주면 검증할 수 없으므로 복원하지 않는다
  const none = createStore(initialState(CATS), { storage: st }).get().view;
  assert.equal(none.pathTo, null);
});

test('잘못된 저장본은 무시하고 기본값을 쓴다', () => {
  const bad = [
    'not json',
    '[]',
    JSON.stringify({ view: { pathTo: 5, pathRev: 'yes', pathQuery: {}, search: 7, hop: 9 } }),
    JSON.stringify({ view: 'x' }),
  ];
  for (const raw of bad) {
    const v = mk(fakeStorage({ cg_view: raw })).get().view;
    assert.equal(v.pathTo, null);
    assert.equal(v.pathRev, false);
    assert.equal(v.pathQuery, '');
    assert.equal(v.search, '');
    assert.equal(v.hop, 1);
  }
});

test('pathTo 없이 pathRev만 저장돼 있으면 반전은 버린다', () => {
  const v = mk(fakeStorage({ cg_view: JSON.stringify({ view: { pathRev: true } }) })).get().view;
  assert.equal(v.pathRev, false);
});

test('잘못된 입력 액션은 상태를 바꾸지 않는다', () => {
  const s = mk();
  const before = s.get();
  s.dispatch(/** @type {any} */ ({ type: 'setPathQuery', value: 3 }));
  s.dispatch(/** @type {any} */ ({ type: 'setSearch', value: null }));
  assert.equal(s.get(), before);
});

test('reduce는 입력 상태를 바꾸지 않는다(깊은 동결 상태로 모든 액션 실행)', () => {
  const deepFreeze = (/** @type {any} */ o) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.values(o).forEach(deepFreeze);
    }
    return o;
  };
  const s = mk();
  pathState(s);
  const actions = [
    { type: 'select', id: 'c' },
    { type: 'deselect' },
    { type: 'setTab', tab: 'path' },
    { type: 'setPathTo', id: 'c' },
    { type: 'togglePathRev' },
    { type: 'setPathQuery', value: 'x' },
    { type: 'setSearch', value: 'y' },
    { type: 'setTrace', trace: { kind: 'path', nodes: ['a', 'b'], edges: ['e1'] } },
    { type: 'clearTrace' },
    { type: 'restoreView', selected: 'a', tab: 'path', pathTo: 'b' },
  ];
  for (const a of actions) {
    const t = createStore(initialState(CATS), { storage: fakeStorage(), nodeIds: IDS });
    pathState(t);
    deepFreeze(t.get());
    // 동결된 상태를 바꾸려 하면 strict 모드(ESM)에서 TypeError가 난다
    assert.doesNotThrow(() => t.dispatch(/** @type {any} */ (a)), a.type);
  }
  // 직접 비교: 한 번 더 같은 상태에서 dispatch 후 이전 참조가 그대로
  const prev = s.get();
  const frozen = JSON.stringify(prev);
  deepFreeze(prev);
  s.dispatch({ type: 'togglePathRev' });
  assert.equal(JSON.stringify(prev), frozen);
  assert.notEqual(s.get(), prev);
});
