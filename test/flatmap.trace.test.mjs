// @ts-check
// 관계도 trace 강조(flatHtml은 문자열 반환이라 DOM 없이 테스트). 실행: node --test test/flatmap.trace.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGraph } from '../src/engine/graph.js';
import { initialState } from '../src/store/store.js';
import { flatHtml } from '../src/render/flatmap.js';

// hub 중심: x→hub, hub→y, hub→z, z→hub(역방향 쌍), w→hub
const RAW = {
  meta: { version: 'test' },
  nodes: [
    { id: 'hub', name: '허브', cat: 'macro' },
    { id: 'x', name: '원인X', cat: 'macro' },
    { id: 'y', name: '결과Y', cat: 'macro' },
    { id: 'z', name: '양방향Z', cat: 'macro' },
    { id: 'w', name: '원인W', cat: 'macro' },
    { id: 'q', name: '<b>"&Q', cat: 'macro' },
  ],
  edges: [
    { id: 'e1', src: 'x', dst: 'hub', sign: '+', level: 'A', r: 0.5 },
    { id: 'e2', src: 'hub', dst: 'y', sign: '+', level: 'A', r: 0.5 },
    { id: 'e3', src: 'hub', dst: 'z', sign: '-', level: 'B', r: 0.4 },
    { id: 'e4', src: 'z', dst: 'hub', sign: '+', level: 'B', r: 0.4 },
    { id: 'e5', src: 'w', dst: 'hub', sign: '+', level: 'C', r: 0.3 },
    { id: 'e6', src: 'q', dst: 'hub', sign: '+', level: 'C', r: 0.3 },
  ],
  cors: [],
};
// flatHtml이 브라우저 전역 innerWidth를 읽는다
globalThis.innerWidth = 400;
const graph = createGraph(/** @type {any} */ (RAW));
const cats = ['macro'];

/** @param {any} [view] */
const stateWith = (view = {}) => {
  const st = initialState(cats);
  return { ...st, view: { ...st.view, ...view } };
};

const paths = (/** @type {string} */ html) => html.match(/<path [^>]*marker-end[^>]*>/g) ?? [];
const boxes = (/** @type {string} */ html) => html.match(/<g class="bx[^"]*"[^>]*>/g) ?? [];
const withCls = (/** @type {string[]} */ list, /** @type {string} */ c) => list.filter((x) => x.includes(c));

test('trace 없으면 강조·흐림 클래스가 없다(기존 출력)', () => {
  for (const hop of [1, 2]) {
    for (const dir of ['both', 'up', 'down']) {
      const html = flatHtml(graph, stateWith({ hop, dir }), 'hub');
      assert.ok(!html.includes('tr-on') && !html.includes('tr-dim'));
      // 엣지 path는 기존 형태 그대로 시작한다
      for (const p of paths(html)) assert.ok(p.startsWith('<path d="M'));
      for (const b of boxes(html)) assert.match(b, /^<g class="bx"( data-act="go" data-id="[^"]*")?>$/);
    }
  }
});

test('trace가 null이어도 undefined 필드와 같은 출력(바이트 동일)', () => {
  const a = flatHtml(graph, stateWith({ trace: null }), 'hub');
  const b = flatHtml(graph, stateWith({}), 'hub');
  assert.equal(a, b);
});

test('경로 trace: trace 노드·엣지에만 tr-on, 나머지는 tr-dim', () => {
  const trace = { kind: 'path', nodes: ['x', 'hub', 'y'], edges: ['e1', 'e2'] };
  const html = flatHtml(graph, stateWith({ trace }), 'hub');
  const ps = paths(html);
  assert.equal(ps.length, 6);
  assert.equal(withCls(ps, 'tr-on').length, 2, 'e1·e2만 강조');
  assert.equal(withCls(ps, 'tr-dim').length, 4);
  const bs = boxes(html);
  assert.equal(bs.length, 7, 'hub + 원인 4 + 결과 2(z는 양쪽 열에 나온다)');
  const on = withCls(bs, 'tr-on');
  assert.equal(on.length, 3, 'x·hub·y');
  assert.ok(on.some((b) => b.includes('data-id="x"')) && on.some((b) => b.includes('data-id="y"')));
  assert.ok(withCls(bs, 'tr-dim').every((b) => !b.includes('data-id="x"') && !b.includes('data-id="y"')));
  // 가운데 노드(data-id 없음)도 trace에 속하므로 tr-on
  assert.ok(on.some((b) => !b.includes('data-id')));
});

test('역방향 엣지는 강조하지 않는다(hub→z만 trace, z→hub는 흐림)', () => {
  const trace = { kind: 'path', nodes: ['hub', 'z'], edges: ['e3'] };
  const html = flatHtml(graph, stateWith({ trace, dir: 'both' }), 'hub');
  const ps = paths(html);
  // hub→z 엣지는 hub 오른쪽 열, z→hub는 왼쪽 열(z는 원인 열에도 나온다)에 각각 그려진다
  assert.equal(withCls(ps, 'tr-on').length, 1, 'hub→z 하나만');
  assert.equal(withCls(ps, 'tr-dim').length, ps.length - 1);
  // 반대 방향 trace(z→hub)로 바꾸면 강조 엣지가 다른 하나로 바뀐다
  const rev = flatHtml(graph, stateWith({ trace: { kind: 'path', nodes: ['z', 'hub'], edges: ['e4'] }, dir: 'both' }), 'hub');
  assert.equal(withCls(paths(rev), 'tr-on').length, 1);
  assert.notEqual(withCls(ps, 'tr-on')[0], withCls(paths(rev), 'tr-on')[0]);
});

test('루프 trace: 닫는 엣지(마지막→처음)도 강조', () => {
  const trace = { kind: 'loop', nodes: ['hub', 'z'], edges: ['e3', 'e4'] };
  const html = flatHtml(graph, stateWith({ trace, dir: 'both' }), 'hub');
  assert.equal(withCls(paths(html), 'tr-on').length, 2, 'hub→z, z→hub');
  assert.equal(withCls(boxes(html), 'tr-on').length, 3, 'hub, z(원인 열), z(결과 열)');
});

test('부호 배지도 엣지와 같은 클래스를 따른다', () => {
  const trace = { kind: 'path', nodes: ['x', 'hub', 'y'], edges: ['e1', 'e2'] };
  const html = flatHtml(graph, stateWith({ trace }), 'hub');
  const gs = html.match(/<g class="tr-(on|dim)"><circle/g) ?? [];
  // 배지는 선 위·노드 위에 두 번 그려진다(기존 동작): 엣지 6개 × 2
  assert.equal(gs.length, 12);
  assert.equal(gs.filter((x) => x.includes('tr-on')).length, 4);
});

test('trace 노드가 화면에 없으면 전부 흐림, 이스케이프 유지', () => {
  const trace = { kind: 'path', nodes: ['nope1', 'nope2'], edges: [] };
  const html = flatHtml(graph, stateWith({ trace }), 'hub');
  assert.ok(!html.includes('tr-on'));
  assert.ok(html.includes('tr-dim'));
  assert.ok(html.includes('&lt;b&gt;&quot;&amp;Q'), '노드 이름은 이스케이프된다');
  assert.ok(!html.includes('<b>"&Q'));
});

test('2단계 보기에서도 trace 엣지만 강조', () => {
  const trace = { kind: 'path', nodes: ['x', 'hub'], edges: ['e1'] };
  const html = flatHtml(graph, stateWith({ trace, hop: 2 }), 'hub');
  assert.equal(withCls(paths(html), 'tr-on').length, 1);
});
