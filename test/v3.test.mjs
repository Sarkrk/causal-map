// @ts-check
// 스키마 v3 · 티어 필터 · 시뮬레이터 이중계상 보정(dedup) & B+/B- 차등 가중치 단위 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v0 from './fixtures/graph.v0.json' with { type: 'json' };
import v1 from './fixtures/graph.v1.json' with { type: 'json' };
import v2 from './fixtures/graph.v2.json' with { type: 'json' };
import { migrate, migrateV2toV3, SCHEMA_VERSION } from '../src/schema/migrate.js';
import { validateGraph } from '../src/schema/validate.js';
import { edgeWeight } from '../src/schema/v3.js';
import { createGraph } from '../src/engine/graph.js';
import { simulate } from '../src/engine/simulate.js';
import { createStore, defaultState, initialState } from '../src/store/store.js';
import { visible, causalVisible } from '../src/store/select.js';
import { revealNode } from '../src/ui/search.js';

const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < 1e-9;

test('migrate: v0/v1/v2 모두 schemaVersion=3으로 무손실 승격되고 검증 통과', () => {
  for (const raw of [v0, v1, v2]) {
    const out = migrate(raw);
    assert.equal(out.schemaVersion, SCHEMA_VERSION);
    assert.equal(out.schemaVersion, 3);
    assert.ok(out.nodes.every((n) => n.tier === 'core' || n.tier === 'bridge' || n.tier === 'econ'));
    const r = validateGraph(out);
    assert.equal(r.ok, true, r.errors.join('\n'));
  }
});

test('migrateV2toV3: 입력 불변성 유지 및 기존 tier 보존', () => {
  const src = structuredClone(v2);
  /** @type {any} */ (src.nodes[0]).tier = 'econ';
  const snap = JSON.stringify(src);
  const out = migrateV2toV3(src);
  assert.equal(JSON.stringify(src), snap);
  assert.equal(out.nodes[0].tier, 'econ');
});

test('validateGraph(v3): state·tier·flags·stats·marketRegime 정상 통과 및 오류 거부', () => {
  const g = structuredClone(migrate(v2));
  g.meta.tiers = { core: g.nodes.length, bridge: 0, econ: 0 };
  g.meta.marketRegime = { code: 'stress', label: '위험회피·급변동', asof: '2026-11-24' };
  g.nodes[0].state = { z: -2.64, chg: '-26.93%', win: '21D', asof: '2026-11-24', fresh: true };
  g.edges[0].flags = ['confounded', 'reverse-lead'];
  g.edges[0].stats = { n: 240, freq: 'M', eraAgree: true };
  assert.deepEqual(validateGraph(g).errors, []);

  const badTier = structuredClone(g);
  /** @type {any} */ (badTier.nodes[0]).tier = 'invalid';
  assert.equal(validateGraph(badTier).ok, false);

  const badState = structuredClone(g);
  badState.nodes[0].state.z = 99;
  assert.equal(validateGraph(badState).ok, false);

  const badFlag = structuredClone(g);
  /** @type {any} */ (badFlag.edges[0]).flags = ['bogus'];
  assert.equal(validateGraph(badFlag).ok, false);
});

test('edgeWeight: B+ > B > B-, confounded/sign-mismatch는 0.7 감쇠', () => {
  assert.equal(edgeWeight({ level: 'A' }), 1.0);
  assert.equal(edgeWeight({ level: 'B', sub: '+' }), 0.85);
  assert.equal(edgeWeight({ level: 'B' }), 0.75);
  assert.equal(edgeWeight({ level: 'B', sub: '-' }), 0.55);
  assert.ok(near(edgeWeight({ level: 'A', flags: ['confounded'] }), 0.7));
  assert.ok(near(edgeWeight({ level: 'B', sub: '+', flags: ['sign-mismatch'] }), 0.85 * 0.7));
});

test('simulate(dedup): 동일 1차 채널 중복 우회 경로 이중계상 차단 & score ∈ [-1, 1]', () => {
  // a → b → d (직접 2홉) AND a → b → x → d (같은 1차 채널 b 경유 3홉)
  const g = createGraph(/** @type {any} */ ({
    schemaVersion: 3,
    meta: {},
    nodes: ['a', 'b', 'x', 'd'].map((id) => ({ id, name: id, tier: 'core' })),
    edges: [
      { id: 'e1', src: 'a', dst: 'b', sign: '+', level: 'B', sub: '+', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
      { id: 'e2', src: 'b', dst: 'd', sign: '+', level: 'B', sub: '+', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
      { id: 'e3', src: 'b', dst: 'x', sign: '+', level: 'B', sub: '+', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
      { id: 'e4', src: 'x', dst: 'd', sign: '+', level: 'B', sub: '+', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
    ],
    cors: [],
  }));
  const dedup = simulate(g, 'a', 1); // default 'dedup'
  const sum = simulate(g, 'a', 1, { aggMode: 'sum' });
  const dDedup = dedup.impacts.find((i) => i.id === 'd');
  const dSum = sum.impacts.find((i) => i.id === 'd');
  assert.ok(dDedup && dSum);
  assert.ok(near(dDedup.score, 0.85 * 0.85), `dedup should keep max channel only: ${dDedup.score}`);
  assert.ok(dSum.score > dDedup.score, 'sum double-counts both detours');
  assert.ok(Math.abs(dDedup.score) <= 1);
});

test('simulate(dedup): 반대 채널이 30% 이상이면 ± 판정 & edge-flag 경고 생성', () => {
  const g = createGraph(/** @type {any} */ ({
    schemaVersion: 3,
    meta: {},
    nodes: ['s', 'p', 'q', 't'].map((id) => ({ id, name: id, tier: 'core' })),
    edges: [
      { id: 'e1', src: 's', dst: 'p', sign: '+', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [], flags: ['confounded'] },
      { id: 'e2', src: 'p', dst: 't', sign: '+', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
      { id: 'e3', src: 's', dst: 'q', sign: '+', level: 'C', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
      { id: 'e4', src: 'q', dst: 't', sign: '-', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
    ],
    cors: [],
  }));
  // p channel: 1.0 * 0.7 = 0.7 (+), q channel: 0.5 (-). ratio = 0.5 / 0.7 = 0.714 >= 0.30 → '±'
  const r = simulate(g, 's', 1);
  const t = r.impacts.find((i) => i.id === 't');
  assert.ok(t);
  assert.equal(t.sign, '±');
  assert.ok(r.warnings.some((w) => w.kind === 'edge-flag' && w.edges?.includes('e1')));
});

test('tier 필터: defaultState는 core+bridge만 표시, revealNode가 econ 노드 선택 시 자동 개방', () => {
  const g = createGraph(/** @type {any} */ ({
    schemaVersion: 3,
    meta: {},
    nodes: [
      { id: 'c1', name: 'c1', sector: 'macro', tier: 'core' },
      { id: 'b1', name: 'b1', sector: 'macro', tier: 'bridge' },
      { id: 'e1', name: 'e1', sector: 'macro', tier: 'econ' },
    ],
    edges: [
      { id: 'x1', src: 'c1', dst: 'b1', sign: '+', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
      { id: 'x2', src: 'b1', dst: 'e1', sign: '+', level: 'A', status: 'open', note: '', r: null, rsrc: '', evidence: [] },
    ],
    cors: [],
  }));
  const st = createStore(defaultState(['macro']), { storage: undefined });
  assert.deepEqual(st.get().filters.tiers, ['core', 'bridge']);
  const v1Vis = visible(g, st.get());
  assert.equal(v1Vis.nodes.has('c1'), true);
  assert.equal(v1Vis.nodes.has('b1'), true);
  assert.equal(v1Vis.nodes.has('e1'), false);
  assert.equal(causalVisible(g, g.edges[1], st.get().filters), false);

  revealNode(g, st, /** @type {any} */ (g.byId.get('e1')));
  assert.equal(st.get().filters.tiers.includes('econ'), true);
  assert.equal(visible(g, st.get()).nodes.has('e1'), true);
});
