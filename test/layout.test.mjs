// @ts-check
// 물리 계산(layout.js)·고정 시드·배치 저장·그리기 중단 조건 테스트. 실행: node --test test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v1 from './fixtures/graph.v1.json' with { type: 'json' };
import {
  createLayout,
  accumulateRepulsion,
  readLayout,
  writeLayout,
  clearLayout,
  shouldDraw,
  LAYOUT_KEY,
  EXACT_MAX,
  SETTLE_ALPHA,
  DEFAULT_SEED,
} from '../src/render/layout.js';
import { mulberry32, nodeRng, nextSeed, hashString } from '../src/render/rng.js';
import { categoriesPresent } from '../src/store/labels.js';

const CATS = ['Real_Economy', 'Inflation_Labor', 'Policy', 'Financial_Market', 'External_Sector', 'Industry_AI', 'Other'];

/**
 * 원본 canvas3d.js의 CP(범주 기준 위치)와 같은 식.
 * @param {string[]} cats
 */
function centersFor(cats) {
  /** @type {Record<string, number[]>} */
  const CP = {};
  cats.forEach((k, i) => {
    const y = 1 - ((i + 0.5) / cats.length) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399;
    CP[k] = [Math.cos(a) * r * 170, y * 170, Math.sin(a) * r * 170];
  });
  return CP;
}

/** @param {string} id @param {string} cat @param {number} deg */
function body(id, cat, deg = 0) {
  return { id, cat, rad: 3.5 + Math.sqrt(deg) * 1.9, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: null, fy: null, fz: null };
}

/** 합성 그래프: n개 노드, m개 무작위 인과 엣지. */
function synth(n, m, seed) {
  const r = mulberry32(seed);
  const degs = new Array(n).fill(0);
  const pairs = [];
  for (let i = 0; i < m; i++) {
    const a = Math.floor(r() * n);
    const b = Math.floor(r() * n);
    if (a === b) continue;
    pairs.push([a, b]);
    degs[a]++;
    degs[b]++;
  }
  const bodies = [];
  for (let i = 0; i < n; i++) bodies.push(body('s' + i, CATS[i % CATS.length], degs[i]));
  const links = pairs.map(([a, b]) => ({ k: /** @type {'c'} */ ('c'), a: bodies[a], b: bodies[b] }));
  return { bodies, links, cent: centersFor(CATS) };
}

/** 픽스처(실데이터 83노드)에서 물리 입력을 만든다. */
function fixture() {
  const deg = new Map();
  for (const e of v1.edges) {
    deg.set(e.src, (deg.get(e.src) ?? 0) + 1);
    deg.set(e.dst, (deg.get(e.dst) ?? 0) + 1);
  }
  const bodies = v1.nodes.map((n) => body(n.id, n.cat, deg.get(n.id) ?? 0));
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const links = v1.edges.map((e) => ({ k: /** @type {'c'} */ ('c'), a: byId.get(e.src), b: byId.get(e.dst) }));
  const cors = (v1.cors ?? []).map((c) => ({ k: /** @type {'r'} */ ('r'), a: byId.get(c.src), b: byId.get(c.dst) }));
  const cats = categoriesPresent({ nodes: v1.nodes });
  return { bodies, links: links.concat(cors.filter((l) => l.a && l.b)), cent: centersFor(cats) };
}

/**
 * 원본 canvas3d.js tick()을 그대로 옮긴 참조 구현(대칭 O(V²)). 입력 객체를 직접 갱신한다.
 * @param {{A: any[], L: any[], alpha: number, cent: Record<string, number[]>}} st
 */
function refTick(st) {
  const A = st.A;
  const VS = new Set(A);
  const alpha = st.alpha;
  for (let i = 0; i < A.length; i++)
    for (let j = i + 1; j < A.length; j++) {
      const a = A[i];
      const b = A[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dz = a.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz + 0.01;
      if (d2 > 200000) continue;
      const d = Math.sqrt(d2);
      const f = ((1700 / d2) * alpha) * (1 + (a.rad + b.rad) / 12);
      dx /= d;
      dy /= d;
      dz /= d;
      a.vx += dx * f;
      a.vy += dy * f;
      a.vz += dz * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
      b.vz -= dz * f;
    }
  st.L.forEach((l) => {
    if (!VS.has(l.a) || !VS.has(l.b)) return;
    const dx = l.b.x - l.a.x;
    const dy = l.b.y - l.a.y;
    const dz = l.b.z - l.a.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const len = l.k === 'r' ? 120 : 85;
    const f = ((d - len) / d) * (l.k === 'r' ? 0.006 : 0.02) * alpha;
    l.a.vx += dx * f;
    l.a.vy += dy * f;
    l.a.vz += dz * f;
    l.b.vx -= dx * f;
    l.b.vy -= dy * f;
    l.b.vz -= dz * f;
  });
  A.forEach((n) => {
    const c = st.cent[n.cat] || [0, 0, 0];
    n.vx += ((c[0] - n.x) * 0.004 - n.x * 0.0015) * alpha;
    n.vy += ((c[1] - n.y) * 0.004 - n.y * 0.0015) * alpha;
    n.vz += ((c[2] - n.z) * 0.004 - n.z * 0.0015) * alpha;
    if (n.fx != null && n.fy != null && n.fz != null) {
      n.x = n.fx;
      n.y = n.fy;
      n.z = n.fz;
      n.vx = n.vy = n.vz = 0;
    } else {
      n.vx *= 0.6;
      n.vy *= 0.6;
      n.vz *= 0.6;
      n.x += n.vx;
      n.y += n.vy;
      n.z += n.vz;
    }
  });
  st.alpha *= 0.985;
}

/** @returns {{getItem:(k:string)=>string|null,setItem:(k:string,v:string)=>void,removeItem:(k:string)=>void,map:Map<string,string>}} */
function fakeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? /** @type {string} */ (map.get(k)) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

/** @param {any} layoutBodies */
function snapshot(bs) {
  return bs.map((b) => [b.x, b.y, b.z, b.vx, b.vy, b.vz]);
}

// ── 1. 정확 계산: 원본과 비트 단위로 같다 ───────────────────────────

test('정확 모드(≤5000): 300틱 후 좌표·속도가 원본 수식과 비트 단위로 같다 (합성 120노드)', () => {
  const g = synth(120, 260, 7);
  const idx = new Map(g.bodies.map((b, i) => [b, i]));
  const lay = createLayout({ bodies: g.bodies, links: g.links, centers: g.cent, seed: 42 });
  lay.setActive(g.bodies, g.links);
  assert.equal(lay.mode, 'exact');

  const ref = { A: g.bodies.map((b) => ({ ...b })), L: [], alpha: lay.alpha, cent: g.cent };
  ref.L = g.links.map((l) => ({ k: l.k, a: ref.A[/** @type {number} */ (idx.get(l.a))], b: ref.A[/** @type {number} */ (idx.get(l.b))] }));
  // 재현 대상: 시드 초기 위치가 같아야 한다
  assert.deepEqual(snapshot(ref.A), snapshot(g.bodies));

  for (let t = 0; t < 300; t++) {
    lay.tick();
    refTick(ref);
  }
  assert.equal(lay.alpha, ref.alpha);
  assert.deepEqual(snapshot(g.bodies), snapshot(ref.A));
});

test('정확 모드: 실데이터 픽스처(83노드)도 300틱 후 원본 수식과 같다', () => {
  const g = fixture();
  const idx = new Map(g.bodies.map((b, i) => [b, i]));
  const lay = createLayout({ bodies: g.bodies, links: g.links, centers: g.cent, seed: DEFAULT_SEED });
  lay.setActive(g.bodies, g.links);
  assert.equal(g.bodies.length, 83);
  const ref = { A: g.bodies.map((b) => ({ ...b })), L: [], alpha: lay.alpha, cent: g.cent };
  ref.L = g.links.map((l) => ({ k: l.k, a: ref.A[/** @type {number} */ (idx.get(l.a))], b: ref.A[/** @type {number} */ (idx.get(l.b))] }));
  for (let t = 0; t < 300; t++) {
    lay.tick();
    refTick(ref);
  }
  assert.deepEqual(snapshot(g.bodies), snapshot(ref.A));
});

// ── 2. Barnes-Hut: 정확 힘과의 오차 ─────────────────────────────────

/**
 * 같은 입력에서 힘만 계산해 노드별 상대오차 평균을 낸다(기준: 노드마다 전 쌍을 더한 값).
 * @param {any[]} bodies
 * @param {number} al
 */
function meanRelErr(bodies, al) {
  const ex = bodies.map((b) => ({ ...b, vx: 0, vy: 0, vz: 0 }));
  const bh = bodies.map((b) => ({ ...b, vx: 0, vy: 0, vz: 0 }));
  accumulateRepulsion(ex, al, 'pairwise');
  accumulateRepulsion(bh, al, 'bh');
  let sum = 0;
  let n = 0;
  let max = 0;
  let dAll = 0;
  let mAll = 0;
  for (let i = 0; i < ex.length; i++) {
    const m = Math.hypot(ex[i].vx, ex[i].vy, ex[i].vz);
    const d = Math.hypot(bh[i].vx - ex[i].vx, bh[i].vy - ex[i].vy, bh[i].vz - ex[i].vz);
    dAll += d;
    mAll += m;
    if (m < 1e-12) continue;
    const e = d / m;
    sum += e;
    if (e > max) max = e;
    n++;
  }
  // agg: 힘 크기로 가중한 오차 Σ|ΔF|/Σ|F|. 안정된 배치에선 노드별 알짜 반발이 거의 상쇄돼
  // 노드별 상대오차의 분모가 0에 가까워지므로(θ를 낮춰도 줄지 않음, 11/13 실측) 이 값으로 판정한다.
  return { mean: sum / n, max, agg: dAll / mAll };
}

test('BH 힘: 무작위 구름(300·1000노드)에서 정확 힘과 평균 상대오차 < 10%', () => {
  const r = mulberry32(99);
  for (const n of [300, 1000]) {
    const bs = [];
    for (let i = 0; i < n; i++) {
      const b = body('u' + i, CATS[i % 7], Math.floor(r() * 6));
      b.x = (r() - 0.5) * 500;
      b.y = (r() - 0.5) * 500;
      b.z = (r() - 0.5) * 500;
      bs.push(b);
    }
    const e = meanRelErr(bs, 1);
    console.log(`# BH 오차 n=${n} 무작위: 평균 ${(e.mean * 100).toFixed(2)}%, 최대 ${(e.max * 100).toFixed(1)}%`);
    assert.ok(e.mean < 0.1, `n=${n} mean ${e.mean}`);
  }
});

test('BH 힘: 실제로 settle된 큰 그래프(800노드 합성)에서도 힘 가중 오차 < 10%', () => {
  const g = synth(800, 1760, 5);
  const lay = createLayout({ bodies: g.bodies, links: g.links, centers: g.cent, seed: 3 });
  lay.setActive(g.bodies, g.links);
  for (let t = 0; t < 350; t++) lay.tick(); // 앱과 같은 방식(정확)으로 자연 배치한 뒤 그 좌표에서 BH 힘을 비교
  const e = meanRelErr(g.bodies, 0.5);
  console.log(`# BH 오차 n=800 settle 후: 힘가중 ${(e.agg * 100).toFixed(2)}%, 노드평균 ${(e.mean * 100).toFixed(2)}%, 최대 ${(e.max * 100).toFixed(1)}%`);
  assert.ok(e.agg < 0.1, `agg ${e.agg}`);
});

// ── 3. 시간 측정 (1틱) ─────────────────────────────────────────────

/** @param {() => void} fn @param {number} reps */
function timeMs(fn, reps) {
  fn(); // 준비(JIT)
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) fn();
  return (performance.now() - t0) / reps;
}

test('1틱 시간: 500노드 전체 tick() < 8ms (목표)', () => {
  const g = synth(500, 1100, 11);
  const lay = createLayout({ bodies: g.bodies, links: g.links, centers: g.cent, seed: 1 });
  lay.setActive(g.bodies, g.links);
  const ms = timeMs(() => lay.tick(), 40);
  console.log(`# 1틱 측정 500노드 tick(): ${ms.toFixed(2)} ms`);
  assert.ok(ms < 8, `500-node tick ${ms.toFixed(2)} ms`);
});

test('1틱 시간 표: 83/300/500/1000 노드 × 정확/BH (반발력 단계, 전체 tick)', () => {
  const rows = [];
  for (const n of [83, 300, 500, 1000]) {
    const g = n === 83 ? fixture() : synth(n, Math.round(n * 2.2), 21);
    const lay = createLayout({ bodies: g.bodies, links: g.links, centers: g.cent, seed: 5 });
    lay.setActive(g.bodies, g.links);
    for (let t = 0; t < 60; t++) lay.tick();
    const exact = timeMs(() => accumulateRepulsion(g.bodies, 0.5, 'exact'), n > 400 ? 3 : 10);
    const bh = timeMs(() => accumulateRepulsion(g.bodies, 0.5, 'bh'), 20);
    const full = timeMs(() => lay.tick(), n > 400 ? 20 : 30);
    rows.push({ n, exact: +exact.toFixed(3), bh: +bh.toFixed(3), full: +full.toFixed(3), mode: lay.mode });
  }
  console.log('# 1틱 측정(ms): ' + JSON.stringify(rows));
  assert.equal(rows.length, 4);
});

// ── 4. 고정 시드·초기 위치 ─────────────────────────────────────────

test('같은 시드 → 같은 좌표; 다른 시드 → 다른 좌표', () => {
  const a = synth(80, 150, 2);
  const b = synth(80, 150, 2);
  createLayout({ bodies: a.bodies, centers: a.cent, seed: 777 });
  createLayout({ bodies: b.bodies, centers: b.cent, seed: 777 });
  assert.deepEqual(snapshot(a.bodies), snapshot(b.bodies));
  const c = synth(80, 150, 2);
  createLayout({ bodies: c.bodies, centers: c.cent, seed: 778 });
  assert.notDeepEqual(snapshot(a.bodies), snapshot(c.bodies));
});

test('노드 하나 추가해도 기존 노드의 초기 좌표는 그대로다(순서가 바뀌어도)', () => {
  const cats = CATS;
  const base = [];
  for (let i = 0; i < 60; i++) base.push(body('k' + i, cats[i % 7]));
  const bA = base.map((b) => ({ ...b }));
  const layA = createLayout({ bodies: bA, centers: centersFor(cats), seed: 31 });
  const posA = Object.fromEntries(bA.map((b) => [b.id, [b.x, b.y, b.z]]));

  // 같은 범주의 새 노드를 맨 앞에 추가
  const bB = [body('new-x', cats[0]), ...base.map((b) => ({ ...b }))];
  createLayout({ bodies: bB, centers: centersFor(cats), seed: 31 });
  for (const b of bB) {
    if (b.id === 'new-x') continue;
    assert.deepEqual([b.x, b.y, b.z], posA[b.id], `node ${b.id} moved`);
  }
  assert.equal(layA.seed, 31);
});

test('nodeRng: 같은 (시드, id)는 같은 수열, 해시 문자열 고정', () => {
  const r1 = nodeRng(5, 'abc');
  const r2 = nodeRng(5, 'abc');
  assert.equal(r1(), r2());
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
  const s = nextSeed(DEFAULT_SEED);
  assert.notEqual(s, DEFAULT_SEED);
  assert.equal(nextSeed(DEFAULT_SEED), s);
});

test('reseed(다음 시드): 좌표가 바뀌고 alpha가 1로 돌아간다. 같은 입력이면 같은 다음 시드', () => {
  const g = synth(90, 160, 4);
  const lay = createLayout({ bodies: g.bodies, centers: g.cent, seed: 9 });
  lay.setActive(g.bodies, g.links);
  for (let t = 0; t < 100; t++) lay.tick();
  const before = snapshot(g.bodies);
  const ns = lay.nextSeed();
  assert.equal(ns, nextSeed(9));
  lay.reseed(ns);
  assert.equal(lay.alpha, 1);
  assert.equal(lay.seed, ns);
  assert.notDeepEqual(snapshot(g.bodies), before);
});

// ── 5. 배치 저장 ──────────────────────────────────────────────────

test('저장/복원: 같은 버전이면 저장 좌표를 되살리고, 없는 노드는 시드 좌표', () => {
  const st = fakeStorage();
  const g = synth(40, 60, 8);
  const lay = createLayout({ bodies: g.bodies, centers: g.cent, seed: 123 });
  lay.setActive(g.bodies, g.links);
  for (let t = 0; t < 50; t++) lay.tick();
  assert.equal(writeLayout(st, 'V1', lay.seed, lay.positions()), true);
  const saved = readLayout(st, 'V1');
  assert.ok(saved);
  assert.equal(saved.seed, 123);

  // 새 실행: 노드 하나 추가된 데이터, 같은 버전
  const h = synth(40, 60, 8);
  h.bodies.push(body('extra', CATS[0]));
  const lay2 = createLayout({ bodies: h.bodies, centers: h.cent, seed: saved.seed, restore: saved.pos, alpha: 0.05 });
  assert.equal(lay2.alpha, 0.05);
  for (const b of h.bodies) {
    if (b.id === 'extra') continue;
    const p = saved.pos[b.id];
    assert.deepEqual([b.x, b.y, b.z], p);
  }
  // 없는 노드('extra')는 시드 좌표(0 근처 + 범주 중심)
  const ex = h.bodies[h.bodies.length - 1];
  assert.ok(Number.isFinite(ex.x) && Number.isFinite(ex.y) && Number.isFinite(ex.z));
});

test('버전이 다르면 저장 좌표를 무시한다(null)', () => {
  const st = fakeStorage();
  writeLayout(st, 'OLD', 5, { a: [1, 2, 3] });
  assert.equal(readLayout(st, 'NEW'), null);
  assert.ok(readLayout(st, 'OLD'));
});

test('깨진 저장값(잘못된 JSON·모양·좌표)은 무시한다', () => {
  assert.equal(readLayout(fakeStorage({ [LAYOUT_KEY]: '{not json' }), 'V'), null);
  assert.equal(readLayout(fakeStorage({ [LAYOUT_KEY]: '[]' }), 'V'), null);
  assert.equal(readLayout(fakeStorage({ [LAYOUT_KEY]: JSON.stringify({ version: 'V', seed: 'x', pos: {} }) }), 'V'), null);
  assert.equal(readLayout(fakeStorage({ [LAYOUT_KEY]: JSON.stringify({ version: 'V', seed: 1, pos: [] }) }), 'V'), null);
  // 잘못된 항목만 있으면 null, 일부만 잘못이면 그 항목만 버린다
  assert.equal(readLayout(fakeStorage({ [LAYOUT_KEY]: JSON.stringify({ version: 'V', seed: 1, pos: { a: [1, 'x', 3] } }) }), 'V'), null);
  const mixed = readLayout(
    fakeStorage({ [LAYOUT_KEY]: JSON.stringify({ version: 'V', seed: 1, pos: { a: [1, 2, 3], b: [NaN, 0, 0] } }) }),
    'V',
  );
  assert.deepEqual(mixed?.pos, { a: [1, 2, 3] });
});

test('저장소가 없거나 던지면 조용히 null/false (앱은 시드 배치로 연다)', () => {
  assert.equal(readLayout(null, 'V'), null);
  assert.equal(writeLayout(undefined, 'V', 1, {}), false);
  const throwing = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.equal(readLayout(throwing, 'V'), null);
  assert.equal(writeLayout(throwing, 'V', 1, { a: [0, 0, 0] }), false);
  assert.doesNotThrow(() => clearLayout(throwing));
});

test('clearLayout: 다시 배치 때 저장 좌표를 버린다', () => {
  const st = fakeStorage();
  writeLayout(st, 'V', 1, { a: [0, 0, 0] });
  clearLayout(st);
  assert.equal(readLayout(st, 'V'), null);
});

test('복원 후 alpha 0.05로 식힐 때 좌표 이동량(측정)', () => {
  const g = synth(120, 260, 6);
  const lay = createLayout({ bodies: g.bodies, links: g.links, centers: g.cent, seed: 50 });
  lay.setActive(g.bodies, g.links);
  for (let t = 0; t < 400; t++) lay.tick();
  const saved = lay.positions();
  const h = synth(120, 260, 6);
  const idx = new Map(h.bodies.map((b, i) => [b.id, i]));
  const lay2 = createLayout({ bodies: h.bodies, links: h.links, centers: h.cent, seed: 50, restore: saved, alpha: 0.05 });
  lay2.setActive(h.bodies, h.links);
  let frames = 0;
  while (lay2.alpha > SETTLE_ALPHA && frames < 2000) {
    lay2.tick();
    frames++;
  }
  let maxMove = 0;
  for (const b of h.bodies) {
    const p = saved[b.id];
    maxMove = Math.max(maxMove, Math.hypot(b.x - p[0], b.y - p[1], b.z - p[2]));
  }
  console.log(`# 복원 후 정지까지 ${frames}틱, 최대 이동 ${maxMove.toFixed(2)} 단위 (idx ${idx.size})`);
  assert.ok(frames < 2000);
});

// ── 6. 그리기 중단 조건 ────────────────────────────────────────────

/** @returns {import('../src/render/layout.js').LoopState} */
const idle = () => ({
  hidden: false,
  alpha: 0,
  autoSpin: false,
  wobble: false,
  inertia: 0,
  pointer: false,
  flying: false,
  dirty: false,
});

test('shouldDraw: 모든 조건이 없을 때만 멈춘다', () => {
  assert.equal(shouldDraw(idle()), false);
  assert.equal(shouldDraw({ ...idle(), alpha: SETTLE_ALPHA }), false); // 경계값(≤0.004)은 멈춤
  assert.equal(shouldDraw({ ...idle(), alpha: SETTLE_ALPHA + 1e-9 }), true);
  assert.equal(shouldDraw({ ...idle(), autoSpin: true }), true);
  assert.equal(shouldDraw({ ...idle(), wobble: true }), true);
  assert.equal(shouldDraw({ ...idle(), inertia: 0.001 }), true);
  assert.equal(shouldDraw({ ...idle(), pointer: true }), true);
  assert.equal(shouldDraw({ ...idle(), flying: true }), true);
  assert.equal(shouldDraw({ ...idle(), dirty: true }), true);
});

test('shouldDraw: 문서가 숨겨지면 항상 멈춘다(자동회전·흔들림이 켜져 있어도)', () => {
  assert.equal(shouldDraw({ ...idle(), hidden: true, autoSpin: true, wobble: true, alpha: 1, dirty: true }), false);
});

test('기본 상태(자동회전·흔들림 켜짐)는 계속 그린다', () => {
  assert.equal(shouldDraw({ ...idle(), autoSpin: true, wobble: true }), true);
});
