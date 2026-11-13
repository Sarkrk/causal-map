// @ts-check
// 주소 라우팅 테스트(parseHash·toHash·initRoute·shareLink). 실행: node --test test/route.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, initialState } from '../src/store/store.js';
import { categoriesPresent } from '../src/store/labels.js';
import { createGraph } from '../src/engine/graph.js';
import { parseHash, toHash, initRoute, shareLink } from '../src/ui/route.js';

const RAW = JSON.parse(readFileSync(new URL('./fixtures/graph.v1.json', import.meta.url), 'utf8'));
const graph = createGraph(RAW);
const cats = categoriesPresent(graph);
const BASE = 'https://sarkrk.github.io/causal-map/';
// 실제 노드 이름 중 기호가 들어간 것들(·, /, (), −, 공백)
const SPECIAL = [
  'AI 수익화·현금흐름',
  '미 재정·국채 공급(기간프리미엄)',
  '달러/위안',
  '국민연금 리밸런싱(국내주식 매도)',
  '미−한 금리차',
  '유가 정제품·OSP',
  '미국 관세·무역정책',
];

for (const name of SPECIAL) assert.ok(graph.byId.has(name), `fixture에 노드 없음: ${name}`);

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)) };
}

/**
 * 주소창과 기록(history)을 흉내 낸다. 브라우저처럼 pushState는 앞 기록을 잘라 쌓고,
 * back()·typeHash()는 popstate·hashchange를 함께 낸다.
 * @param {string} start  시작 해시(예: '#n=...')
 */
function fakeWin(start = '') {
  /** @type {Map<string, Function[]>} */
  const listeners = new Map();
  let entries = [BASE + start];
  let idx = 0;
  const log = { pushes: 0, replaces: 0 };
  const fire = (t) => (listeners.get(t) ?? []).forEach((f) => f({}));
  return {
    log,
    get location() {
      const u = new URL(entries[idx]);
      return { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash };
    },
    get url() {
      return entries[idx];
    },
    entries: () => entries.slice(),
    history: {
      pushState(_s, _t, url) {
        entries = entries.slice(0, idx + 1);
        entries.push(new URL(url, entries[idx]).href);
        idx++;
        log.pushes++;
      },
      replaceState(_s, _t, url) {
        entries[idx] = new URL(url, entries[idx]).href;
        log.replaces++;
      },
    },
    addEventListener(t, fn) {
      listeners.set(t, [...(listeners.get(t) ?? []), fn]);
    },
    removeEventListener(t, fn) {
      listeners.set(t, (listeners.get(t) ?? []).filter((f) => f !== fn));
    },
    /** 뒤로 가기 */
    back() {
      if (idx === 0) return false;
      idx--;
      fire('popstate');
      fire('hashchange');
      return true;
    },
    /** 주소창에 해시를 직접 입력(새 기록 + popstate + hashchange) */
    typeHash(h) {
      entries = entries.slice(0, idx + 1);
      entries.push(new URL(h, entries[idx]).href);
      idx++;
      fire('popstate');
      fire('hashchange');
    },
    fire,
  };
}

/** @param {string} start */
function setup(start = '') {
  const win = fakeWin(start);
  const store = createStore(initialState(cats), { storage: fakeStorage() });
  /** @type {string[]} */
  const opened = [];
  const route = initRoute({
    graph,
    store,
    win,
    onOpenNode: (id) => {
      opened.push(id);
      store.dispatch({ type: 'select', id });
    },
  });
  return { win, store, opened, route };
}

// ---------- parseHash / toHash ----------

test('특수문자가 들어간 실제 노드 이름도 왕복 보존된다', () => {
  for (const name of SPECIAL) {
    const view = { selected: name, tab: 'in', dir: 'up', hop: 2, pathTo: '유가' };
    const h = toHash(view);
    assert.equal(h.startsWith('#n='), true, name);
    assert.equal(h.slice(1).split('&').length, 5, `값 안에 & 가 새면 안 됨: ${name}`);
    assert.deepEqual(parseHash(h), { selected: name, tab: 'in', dir: 'up', hop: 2, pathTo: '유가' }, name);
  }
});

test('& = # 공백 % 가 든 임의 이름도 왕복 보존된다', () => {
  for (const name of ['A&B = C #D? 100%', "x'y\"z", 'a=b&c=d']) {
    assert.deepEqual(parseHash(toHash({ selected: name })), { selected: name }, name);
  }
});

test('기본값(탭 map, 방향 both, 단계 1, 도착 없음)은 주소에서 생략한다', () => {
  assert.equal(toHash({ selected: '유가', tab: 'map', dir: 'both', hop: 1, pathTo: null }), '#n=' + encodeURIComponent('유가'));
  assert.equal(toHash({ selected: '유가' }), '#n=' + encodeURIComponent('유가'));
  assert.equal(toHash({ selected: null, tab: 'in', dir: 'up' }), '');
  assert.deepEqual(parseHash('#n=' + encodeURIComponent('유가')), { selected: '유가' });
});

test('깨진 입력은 null이다(빈 해시·선택 없음·잘못된 %-인코딩)', () => {
  assert.equal(parseHash(''), null);
  assert.equal(parseHash('#'), null);
  assert.equal(parseHash('#t=map&d=up'), null, '선택 노드(n)가 없으면 null');
  assert.equal(parseHash('#n=%E0%A4%A'), null, '잘린 UTF-8');
  assert.equal(parseHash('#n=%'), null, '%만 있음');
  assert.equal(parseHash('#n=유가&x=%ZZ'), null, '모르는 키라도 인코딩이 깨지면 null');
  assert.equal(parseHash(/** @type {any} */ (undefined)), null);
});

test('모르는 키와 잘못된 t·d·h·to 값은 무시하고 기본값을 쓴다', () => {
  assert.deepEqual(parseHash('#n=유가&zz=1&t=bogus&h=5&d=left'), { selected: '유가' });
  assert.deepEqual(parseHash('#n=' + encodeURIComponent('유가') + '&t=out&h=2'), { selected: '유가', tab: 'out', hop: 2 });
  assert.deepEqual(parseHash('n=유가&t=out'), { selected: '유가', tab: 'out' }, '앞의 # 없이도 읽는다');
});

// ---------- initRoute: 부팅 ----------

test('부팅: 주소가 가리키는 노드를 열고 탭·방향·단계를 복원한다', () => {
  const { win, store, opened } = setup(toHash({ selected: '유가', tab: 'out', dir: 'down', hop: 2 }));
  const v = store.get().view;
  assert.equal(v.selected, '유가');
  assert.equal(v.tab, 'out');
  assert.equal(v.dir, 'down');
  assert.equal(v.hop, 2);
  assert.deepEqual(opened, ['유가']);
  assert.equal(win.entries().length, 1, '부팅 때 기록을 더 쌓지 않는다');
  assert.equal(win.log.pushes + win.log.replaces, 0);
});

test('부팅: 없는 노드면 선택 없이 해시만 지운다', () => {
  const { win, store, opened } = setup('#n=' + encodeURIComponent('없는 노드'));
  assert.equal(store.get().view.selected, null);
  assert.deepEqual(opened, []);
  assert.equal(win.url, BASE);
});

test('부팅: 도착 노드가 없으면 도착만 버리고 주소를 고친다', () => {
  const { win, store } = setup('#n=' + encodeURIComponent('유가') + '&t=path&to=' + encodeURIComponent('없는 노드'));
  assert.equal(store.get().view.selected, '유가');
  assert.equal(store.get().view.tab, 'path');
  assert.equal(store.get().view.pathTo, null);
  assert.equal(win.url, BASE + '#n=' + encodeURIComponent('유가') + '&t=path');
});

// ---------- initRoute: 주소 갱신 ----------

test('선택이 바뀌면 push, 탭·방향·단계·도착이 바뀌면 replace', () => {
  const { win, store } = setup();
  store.dispatch({ type: 'select', id: '유가' });
  assert.equal(win.log.pushes, 1);
  assert.equal(win.url, BASE + toHash({ selected: '유가', tab: 'map' }));

  store.dispatch({ type: 'setTab', tab: 'out' });
  store.dispatch({ type: 'setDir', dir: 'down' });
  store.dispatch({ type: 'setHop', hop: 2 });
  store.dispatch({ type: 'setPathTo', id: '미−한 금리차' });
  assert.equal(win.log.pushes, 1, '같은 노드 안의 변경은 기록을 쌓지 않는다');
  assert.equal(win.log.replaces, 4);
  assert.equal(win.url, BASE + toHash({ selected: '유가', tab: 'out', dir: 'down', hop: 2, pathTo: '미−한 금리차' }));
});

test('해제하면 push하고 주소에서 해시를 뺀다', () => {
  const { win, store } = setup();
  store.dispatch({ type: 'select', id: '달러/위안' });
  store.dispatch({ type: 'deselect' });
  assert.equal(win.log.pushes, 2);
  assert.equal(win.url, BASE);
});

// ---------- initRoute: 뒤로 가기 ----------

test('뒤로 가기: 이전 노드(탭 포함)로 돌아가고, 맨 처음이면 선택이 해제된다', () => {
  const { win, store, opened } = setup();
  store.dispatch({ type: 'select', id: '유가' });
  store.dispatch({ type: 'setTab', tab: 'out' });
  store.dispatch({ type: 'select', id: '달러/위안' });
  store.dispatch({ type: 'deselect' });
  const pushesBefore = win.log.pushes;

  assert.equal(win.back(), true);
  assert.equal(store.get().view.selected, '달러/위안');
  assert.equal(win.back(), true);
  assert.equal(store.get().view.selected, '유가');
  assert.equal(store.get().view.tab, 'out', '이전 노드의 탭 복원');
  assert.equal(win.back(), true);
  assert.equal(store.get().view.selected, null, '맨 처음 기록이면 시트가 닫힌다');
  assert.equal(win.url, BASE);

  assert.equal(win.log.pushes, pushesBefore, '뒤로 가기 중에는 기록을 쌓지 않는다');
  assert.deepEqual(opened, ['달러/위안', '유가'], 'popstate와 hashchange가 겹쳐도 한 번만 연다');
});

test('주소창에 직접 입력해도 같은 보기로 맞춘다', () => {
  const { win, store, opened } = setup();
  win.typeHash('#n=' + encodeURIComponent('유가') + '&t=out');
  assert.equal(store.get().view.selected, '유가');
  assert.equal(store.get().view.tab, 'out');
  assert.deepEqual(opened, ['유가']);
});

test('깨진 주소로 뒤로 가면 선택을 해제하고 주소를 정리한다', () => {
  const { win, store } = setup();
  store.dispatch({ type: 'select', id: '유가' });
  win.typeHash('#n=%E0%A4%A');
  assert.equal(store.get().view.selected, null);
  assert.equal(win.url, BASE);
});

test('dispose 뒤에는 상태가 바뀌어도 주소를 건드리지 않는다', () => {
  const win = fakeWin();
  const store = createStore(initialState(cats), { storage: fakeStorage() });
  const r = initRoute({ graph, store, win, onOpenNode: () => {} });
  r.dispose();
  const before = win.log.pushes + win.log.replaces;
  store.dispatch({ type: 'select', id: '유가' });
  assert.equal(win.log.pushes + win.log.replaces, before);
});

// ---------- shareLink ----------

/** @returns {any} */
function plainWin() {
  return { location: { origin: 'https://sarkrk.github.io', pathname: '/causal-map/', search: '', hash: '' } };
}

test('shareLink: navigator.share가 있으면 제목과 절대 주소로 공유한다', async () => {
  /** @type {any[]} */
  const calls = [];
  const nav = { share: async (d) => void calls.push(d) };
  const r = await shareLink({ selected: '유가', tab: 'out' }, '유가', { win: plainWin(), nav });
  assert.equal(r, 'shared');
  assert.deepEqual(calls, [
    { title: '인과 지도 · 유가', url: 'https://sarkrk.github.io/causal-map/#n=' + encodeURIComponent('유가') + '&t=out' },
  ]);
});

test('shareLink: share가 없으면 클립보드에 복사하고 안내한다', async () => {
  /** @type {string[]} */
  const copied = [];
  /** @type {string[]} */
  const notes = [];
  const nav = { clipboard: { writeText: async (t) => void copied.push(t) } };
  const r = await shareLink({ selected: '달러/위안' }, '달러/위안', { win: plainWin(), nav, notify: (m) => notes.push(m) });
  assert.equal(r, 'copied');
  assert.deepEqual(copied, ['https://sarkrk.github.io/causal-map/#n=' + encodeURIComponent('달러/위안')]);
  assert.deepEqual(notes, ['링크를 복사했습니다']);
});

test('shareLink: 공유·복사가 모두 안 되면 prompt로 주소를 보여준다', async () => {
  /** @type {string[]} */
  const shown = [];
  const r = await shareLink({ selected: '유가' }, '유가', {
    win: plainWin(),
    nav: {},
    prompt: (_m, v) => void shown.push(v),
  });
  assert.equal(r, 'prompted');
  assert.deepEqual(shown, ['https://sarkrk.github.io/causal-map/#n=' + encodeURIComponent('유가')]);
});

test('shareLink: 사용자가 공유를 취소하면 복사하지 않는다', async () => {
  let copied = false;
  const nav = {
    share: async () => {
      throw Object.assign(new Error('cancel'), { name: 'AbortError' });
    },
    clipboard: { writeText: async () => void (copied = true) },
  };
  assert.equal(await shareLink({ selected: '유가' }, '유가', { win: plainWin(), nav }), 'cancelled');
  assert.equal(copied, false);
});

test('shareLink: 공유가 실패하면 클립보드로 넘어간다', async () => {
  const nav = {
    share: async () => {
      throw new Error('not allowed');
    },
    clipboard: { writeText: async () => {} },
  };
  assert.equal(await shareLink({ selected: '유가' }, '유가', { win: plainWin(), nav, notify: () => {} }), 'copied');
});
