// @ts-check
// 섹터 구심점(11/23): 라벨·필터 상태·가시성·스키마 검증. 실행: node --test test/sector.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SN, SECC, SECTOR_ORDER, sectorsPresent } from '../src/store/labels.js';
import { createStore, defaultState } from '../src/store/store.js';
import { visible } from '../src/store/select.js';
import { createGraph } from '../src/engine/graph.js';
import { validateGraph } from '../src/schema/validate.js';

/** @returns {{getItem:(k:string)=>string|null,setItem:(k:string,v:string)=>void}} */
function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)) };
}

/** @param {{id:string,sector?:string|null}[]} ns */
function graphOf(ns) {
  return createGraph({
    schemaVersion: 2,
    meta: { title: 't', version: 'v', generated: '2026-11-23 00:00', nodes: ns.length, edges: 0, levels: {} },
    nodes: ns.map((n) => ({ layer: 1, series: null, desc: '', descSrc: '', aka: [], ...n, name: n.id })),
    edges: [],
    cors: [],
  });
}

/** @param {string[]} sectors */
const fresh = (sectors) => createStore(defaultState(sectors), { storage: fakeStorage() });

test('섹터 라벨: 9개 키 전부 이름·색이 있다', () => {
  assert.equal(SECTOR_ORDER.length, 9);
  for (const k of SECTOR_ORDER) {
    assert.ok(SN[/** @type {'other'} */ (k)], k);
    assert.match(SECC[/** @type {'other'} */ (k)], /^#[0-9a-f]{6}$/i, k);
  }
});

test('sectorsPresent: 데이터에 있는 섹터만, 순서 유지, 없으면 other', () => {
  const g = graphOf([
    { id: 'a', sector: 'macro' },
    { id: 'b', sector: null },
    { id: 'c', sector: 'semi' },
  ]);
  assert.deepEqual(sectorsPresent(g), ['macro', 'semi', 'other']);
});

test('toggleSector·soloSector: 끄기·켜기·단독·복원', () => {
  const s = fresh(['macro', 'semi']);
  s.dispatch({ type: 'toggleSector', sector: 'macro' });
  assert.deepEqual(s.get().filters.sectors, ['semi']);
  s.dispatch({ type: 'toggleSector', sector: 'macro' });
  assert.deepEqual(s.get().filters.sectors, ['macro', 'semi']); // 순서는 SECTOR_ORDER 기준
  s.dispatch({ type: 'soloSector', sector: 'semi' });
  assert.deepEqual(s.get().filters.sectors, ['semi']);
  s.dispatch({ type: 'soloSector', sector: 'semi' }); // 이미 단독 → 전체 복원
  assert.deepEqual(s.get().filters.sectors, SECTOR_ORDER);
  const before = s.get();
  s.dispatch({ type: 'soloSector', sector: 'bogus' }); // 없는 키는 무시
  assert.equal(s.get(), before);
});

test('visible: 섹터 필터가 노드·엣지를 거른다', () => {
  const g = createGraph({
    schemaVersion: 2,
    meta: { title: 't', version: 'v', generated: '2026-11-23 00:00', nodes: 2, edges: 1, levels: { A: 1 } },
    nodes: [
      { id: 'a', name: 'a', sector: 'macro', layer: 1, series: null, desc: '', descSrc: '', aka: [] },
      { id: 'b', name: 'b', sector: 'finance', layer: 1, series: null, desc: '', descSrc: '', aka: [] },
    ],
    edges: [{ id: 'e1', src: 'a', dst: 'b', sign: '+', level: 'A', status: 'open', r: null, rsrc: '', note: '', evidence: [] }],
    cors: [],
  });
  const s = fresh(['macro', 'finance']);
  assert.equal(visible(g, s.get()).nodes.size, 2);
  s.dispatch({ type: 'soloSector', sector: 'macro' });
  const v = visible(g, s.get());
  assert.deepEqual([...v.nodes], ['a']);
  assert.equal(v.causal.length, 0); // 교차 엣지는 한쪽이 숨으면 같이 숨는다(노드는 고립 판정에서 제외)
});

test('validateGraph: sector 허용 키·값 검증', () => {
  const base = {
    schemaVersion: 2,
    meta: { title: 't', version: 'v', generated: '2026-11-23 00:00', nodes: 1, edges: 0, levels: {} },
    nodes: [{ id: 'a', name: 'a', sector: 'macro', layer: 1, series: null, desc: '테스트 노드', descSrc: 'test', aka: [] }],
    edges: [],
    cors: [],
  };
  assert.deepEqual(validateGraph(structuredClone(base)).errors, []);
  const bad = structuredClone(base);
  bad.nodes[0].sector = 'bogus';
  assert.ok(validateGraph(bad).errors.some((e) => e.includes('sector')));
});
test('구버전 cat은 필수도 검증 대상도 아니다(무시)', () => {
  const g = structuredClone({
    schemaVersion: 2,
    meta: { title: 't', version: 'v', generated: '2026-11-25 00:00', nodes: 2, edges: 0, levels: {} },
    nodes: [
      { id: 'a', name: 'a', sector: 'macro', layer: 1, series: null, aka: [] },
      { id: 'b', name: 'b', cat: 'Whatever_Old', layer: 1, series: null, aka: [] },
    ],
    edges: [],
    cors: [],
  });
  assert.deepEqual(validateGraph(g).errors, []);
  const graph = createGraph(g);
  assert.deepEqual(sectorsPresent(graph), ['macro', 'other']);
});
