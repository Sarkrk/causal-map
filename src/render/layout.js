// @ts-check
// 3D 힘그래프 계산. DOM을 쓰지 않는다(테스트는 node에서 바로 돌린다).
// - 노드 5000개 이하(실측: 이 힘 법칙·컷오프에선 BH가 더 느림): 원본과 같은 정확 O(V²) 반발력(같은 입력이면 비트 단위로 같은 결과).
// - 5000개 초과: Barnes-Hut 8분트리(theta 0.9). 셀은 질량중심·평균 반지름으로 근사한다.
// 노드 객체(Body)는 canvas3d.js가 만들고, 여기서는 물리 필드(x,y,z,v*,f*)만 갱신한다.
import { nodeRng, nextSeed } from './rng.js';

/**
 * @typedef {Object} PhysBody
 * @property {string} id
 * @property {string} cat
 * @property {number} rad
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} vx
 * @property {number} vy
 * @property {number} vz
 * @property {number|null} fx
 * @property {number|null} fy
 * @property {number|null} fz
 */

/**
 * @typedef {Object} PhysLink
 * @property {'c'|'r'} k
 * @property {PhysBody} a
 * @property {PhysBody} b
 */

/** @typedef {Record<string, number[]>} Centers 범주 → [x,y,z] 기준 위치 */
/** @typedef {Record<string, [number, number, number]>} SavedPos id → [x,y,z] */

/** 기본 시드. 앱을 열 때마다 같은 모양이 나온다. */
export const DEFAULT_SEED = 20261113;
/** 이 값 이하인 노드 수까지는 정확 계산, 초과하면 Barnes-Hut. */
export const EXACT_MAX = 5000; // 11/13 실측: 컷오프(r≈447)가 배치 크기와 비슷해 정확한 BH는 1000노드에서도 정확 계산보다 6배 느림. 사실상 정확 계산만 쓴다(2000노드 반발 16ms).
/** Barnes-Hut 개방 기준(셀 크기 / 거리). */
export const THETA = 0.9;
/** 이 값 아래로 떨어지면 정지로 본다(그리기·저장 기준). */
export const SETTLE_ALPHA = 0.004;
/** 저장 좌표로 시작할 때의 alpha(열자마자 출렁이지 않게 낮게). */
export const RESTORE_ALPHA = 0.05;

const MAX_DEPTH = 40;
const CUTOFF2 = 200000;

/**
 * 한 노드 쌍의 반발 힘을 a에만 더한다(Barnes-Hut 쪽). 수식은 정확 계산과 같다.
 * @param {PhysBody} a
 * @param {PhysBody} b
 * @param {number} al
 */
function pushFrom(a, b, al) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  const d2 = dx * dx + dy * dy + dz * dz + 0.01;
  if (d2 > CUTOFF2) return;
  const d = Math.sqrt(d2);
  const f = ((1700 / d2) * al) * (1 + (a.rad + b.rad) / 12);
  a.vx += (dx / d) * f;
  a.vy += (dy / d) * f;
  a.vz += (dz / d) * f;
}

/**
 * 옥트리 셀. 잎은 items를 갖고, 가지는 kids(8칸, 없으면 null)를 갖는다.
 * @typedef {Object} Cell
 * @property {number} ox
 * @property {number} oy
 * @property {number} oz
 * @property {number} h      절반 한 변
 * @property {number} n
 * @property {number} sx
 * @property {number} sy
 * @property {number} sz
 * @property {number} sr
 * @property {(Cell|null)[]|null} kids
 * @property {PhysBody[]} items
 */

/** @returns {Cell} */
function newCell(ox, oy, oz, h) {
  return { ox, oy, oz, h, n: 0, sx: 0, sy: 0, sz: 0, sr: 0, kids: null, items: [] };
}

/**
 * @param {Cell} c
 * @param {PhysBody} b
 * @returns {number} 0..7
 */
function octant(c, b) {
  return (b.x >= c.ox ? 1 : 0) | (b.y >= c.oy ? 2 : 0) | (b.z >= c.oz ? 4 : 0);
}

/**
 * @param {Cell} c
 * @param {PhysBody} b
 * @param {number} depth
 */
function pushDown(c, b, depth) {
  const k = octant(c, b);
  if (!c.kids) c.kids = [null, null, null, null, null, null, null, null];
  let kid = c.kids[k];
  if (!kid) {
    const h2 = c.h / 2;
    kid = newCell(c.ox + (k & 1 ? h2 : -h2), c.oy + (k & 2 ? h2 : -h2), c.oz + (k & 4 ? h2 : -h2), h2);
    c.kids[k] = kid;
  }
  insertCell(kid, b, depth + 1);
}

/**
 * @param {Cell} c
 * @param {PhysBody} b
 * @param {number} depth
 */
function insertCell(c, b, depth) {
  c.n++;
  c.sx += b.x;
  c.sy += b.y;
  c.sz += b.z;
  c.sr += b.rad;
  if (!c.kids) {
    if (c.items.length === 0 || depth >= MAX_DEPTH) {
      c.items.push(b);
      return;
    }
    const old = c.items;
    c.items = [];
    for (const o of old) pushDown(c, o, depth);
  }
  pushDown(c, b, depth);
}

/**
 * 활성 노드로 옥트리를 만든다.
 * @param {PhysBody[]} A
 * @returns {Cell}
 */
function buildTree(A) {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (const b of A) {
    if (b.x < x0) x0 = b.x;
    if (b.x > x1) x1 = b.x;
    if (b.y < y0) y0 = b.y;
    if (b.y > y1) y1 = b.y;
    if (b.z < z0) z0 = b.z;
    if (b.z > z1) z1 = b.z;
  }
  const h = Math.max(x1 - x0, y1 - y0, z1 - z0) / 2 + 1;
  const root = newCell((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, h);
  for (const b of A) insertCell(root, b, 0);
  return root;
}

/**
 * 셀 c가 노드 a에 주는 반발을 a에 더한다(개방 기준을 넘으면 아래로 내려간다).
 * @param {Cell} c
 * @param {PhysBody} a
 * @param {number} al
 */
function bhForce(c, a, al) {
  if (c.n === 0) return;
  if (!c.kids) {
    for (const b of c.items) if (b !== a) pushFrom(a, b, al);
    return;
  }
  // 컷오프는 셀 상자 기준으로 판정한다(11/13 수정: 질량중심 기준이면 컷오프 경계의 셀이 통째로
  // 빠지거나 들어가 θ와 무관한 오차 ~13%가 났다). 상자 전체가 밖이면 버리고, 일부만 걸치면 연다.
  const ax = Math.max(0, Math.abs(a.x - c.ox) - c.h);
  const ay = Math.max(0, Math.abs(a.y - c.oy) - c.h);
  const az = Math.max(0, Math.abs(a.z - c.oz) - c.h);
  if (ax * ax + ay * ay + az * az + 0.01 > CUTOFF2) return;
  const fx = Math.abs(a.x - c.ox) + c.h;
  const fy = Math.abs(a.y - c.oy) + c.h;
  const fz = Math.abs(a.z - c.oz) + c.h;
  const inside = ax === 0 && ay === 0 && az === 0;
  if (!inside && fx * fx + fy * fy + fz * fz + 0.01 <= CUTOFF2) {
    const mx = c.sx / c.n;
    const my = c.sy / c.n;
    const mz = c.sz / c.n;
    const dx = a.x - mx;
    const dy = a.y - my;
    const dz = a.z - mz;
    const d2 = dx * dx + dy * dy + dz * dz + 0.01;
    const s = 2 * c.h;
    if (s * s < THETA * THETA * d2) {
      const d = Math.sqrt(d2);
      const f = ((c.n * (1700 / d2)) * al) * (1 + (a.rad + c.sr / c.n) / 12);
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      a.vz += (dz / d) * f;
      return;
    }
  }
  for (const kid of /** @type {(Cell|null)[]} */ (c.kids)) if (kid) bhForce(kid, a, al);
}

/**
 * 원본과 같은 정확 반발(쌍마다 한 번, 대칭). 수식·연산 순서를 바꾸지 않는다.
 * @param {PhysBody[]} A
 * @param {number} alpha
 */
function repelExact(A, alpha) {
  for (let i = 0; i < A.length; i++)
    for (let j = i + 1; j < A.length; j++) {
      const a = A[i];
      const b = A[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dz = a.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz + 0.01;
      if (d2 > CUTOFF2) continue;
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
}

/**
 * 반발력만 계산해 vx/vy/vz에 더한다(측정·테스트용). tick()이 쓰는 것과 같은 코드를 쓴다.
 * method: 'auto'(tick과 같은 선택: ≤600 정확, 초과 BH) | 'exact'(대칭 O(V²)) | 'bh' | 'pairwise'(노드마다 전 쌍, BH 오차 기준).
 * @param {PhysBody[]} A
 * @param {number} al
 * @param {'auto'|'exact'|'bh'|'pairwise'} [method]
 */
export function accumulateRepulsion(A, al, method = 'auto') {
  if (method === 'bh' || (method === 'auto' && A.length > EXACT_MAX)) {
    const root = buildTree(A);
    for (const a of A) bhForce(root, a, al);
  } else if (method === 'pairwise') {
    for (const a of A) for (const b of A) if (a !== b) pushFrom(a, b, al);
  } else {
    repelExact(A, al);
  }
}

/**
 * 물리 계산기를 만든다. 시드에서 초기 위치를 정하고(노드 id별 난수), tick()마다 한 단계 진행한다.
 * @param {{bodies: PhysBody[], links?: PhysLink[], centers?: Centers, seed?: number, restore?: SavedPos|null, alpha?: number}} o
 *   restore: 있으면 그 좌표를 먼저 쓰고, 없는 노드만 시드 좌표를 쓴다.
 */
export function createLayout(o) {
  const bodies = o.bodies;
  const centers = o.centers ?? {};
  let curSeed = (o.seed ?? DEFAULT_SEED) >>> 0;
  let al = o.alpha ?? 1;
  /** @type {PhysBody[]} */
  let active = [];
  /** @type {Set<PhysBody>} */
  let activeSet = new Set();
  /** @type {PhysLink[]} */
  let links = o.links ?? [];

  /** @param {string} cat */
  const center = (cat) => centers[cat] || [0, 0, 0];

  /** 시드 좌표를 모든 노드에 쓴다(속도 0). 노드마다 id에서 난수를 따로 뽑는다. */
  function seedPositions() {
    for (const n of bodies) {
      const c = center(n.cat);
      const r = nodeRng(curSeed, n.id);
      n.x = c[0] + (r() - 0.5) * 140;
      n.y = c[1] + (r() - 0.5) * 140;
      n.z = c[2] + (r() - 0.5) * 140;
      n.vx = n.vy = n.vz = 0;
    }
  }

  /** @param {SavedPos} pos */
  function applyRestore(pos) {
    for (const n of bodies) {
      const p = pos[n.id];
      if (p) {
        n.x = p[0];
        n.y = p[1];
        n.z = p[2];
        n.vx = n.vy = n.vz = 0;
      }
    }
  }

  seedPositions();
  if (o.restore) applyRestore(o.restore);

  function tick() {
    const A = active;
    if (A.length > EXACT_MAX) {
      const root = buildTree(A);
      for (const a of A) bhForce(root, a, al);
    } else {
      repelExact(A, al);
    }
    for (const l of links) {
      if (!activeSet.has(l.a) || !activeSet.has(l.b)) continue;
      const dx = l.b.x - l.a.x;
      const dy = l.b.y - l.a.y;
      const dz = l.b.z - l.a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const len = l.k === 'r' ? 120 : 85;
      const f = ((d - len) / d) * (l.k === 'r' ? 0.006 : 0.02) * al;
      l.a.vx += dx * f;
      l.a.vy += dy * f;
      l.a.vz += dz * f;
      l.b.vx -= dx * f;
      l.b.vy -= dy * f;
      l.b.vz -= dz * f;
    }
    for (const n of A) {
      const c = center(n.cat);
      n.vx += ((c[0] - n.x) * 0.004 - n.x * 0.0015) * al;
      n.vy += ((c[1] - n.y) * 0.004 - n.y * 0.0015) * al;
      n.vz += ((c[2] - n.z) * 0.004 - n.z * 0.0015) * al;
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
    }
    al *= 0.985;
  }

  return {
    /** 현재 alpha(식힘 계수). */
    get alpha() {
      return al;
    },
    /** @param {number} v */
    setAlpha(v) {
      al = v;
    },
    /** @param {number} a alpha를 최소 a까지 올린다. */
    reheat(a) {
      al = Math.max(al, a);
    },
    tick,
    /**
     * 활성 노드·링크를 바꾼다(필터·설정 변경 때). 위치는 그대로 둔다.
     * @param {PhysBody[]} nodes
     * @param {PhysLink[]} nextLinks
     */
    setActive(nodes, nextLinks) {
      active = nodes;
      activeSet = new Set(nodes);
      links = nextLinks;
    },
    /**
     * 새 시드로 다시 배치한다. alpha는 1로 돌아간다(호출자가 250틱 돌린다).
     * @param {number} seed
     */
    reseed(seed) {
      curSeed = seed >>> 0;
      seedPositions();
      al = 1;
    },
    /** 다시 배치 다음 시드(이전 시드에서 결정적으로 이어짐). */
    nextSeed() {
      return nextSeed(curSeed);
    },
    /** 현재 시드. */
    get seed() {
      return curSeed;
    },
    /** 활성 노드 수가 EXACT_MAX 이하면 'exact', 넘으면 'bh'. */
    get mode() {
      return active.length > EXACT_MAX ? 'bh' : 'exact';
    },
    /** @returns {SavedPos} 모든 노드의 현재 좌표 */
    positions() {
      /** @type {SavedPos} */
      const out = {};
      for (const n of bodies) out[n.id] = [n.x, n.y, n.z];
      return out;
    },
  };
}

// ── 배치 저장 (localStorage 'cg_layout') ───────────────────────────────

export const LAYOUT_KEY = 'cg_layout';

/**
 * @typedef {Object} LayoutStorage
 * @property {(k: string) => string | null} getItem
 * @property {(k: string, v: string) => void} setItem
 * @property {(k: string) => void} [removeItem]
 */

/**
 * 저장된 배치를 읽는다. 버전이 다르거나 깨졌으면 null(무시).
 * @param {LayoutStorage|null|undefined} storage
 * @param {string} version meta.version
 * @returns {{seed: number, pos: SavedPos}|null}
 */
export function readLayout(storage, version) {
  if (!storage) return null;
  /** @type {string|null} */
  let raw;
  try {
    raw = storage.getItem(LAYOUT_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  /** @type {any} */
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  if (typeof o.version !== 'string' || o.version !== String(version)) return null;
  if (typeof o.seed !== 'number' || !Number.isFinite(o.seed)) return null;
  if (!o.pos || typeof o.pos !== 'object' || Array.isArray(o.pos)) return null;
  /** @type {SavedPos} */
  const pos = {};
  let n = 0;
  for (const [id, v] of Object.entries(o.pos)) {
    if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      pos[id] = [v[0], v[1], v[2]];
      n++;
    }
  }
  if (n === 0) return null;
  return { seed: o.seed >>> 0, pos };
}

/**
 * @param {LayoutStorage|null|undefined} storage
 * @param {string} version
 * @param {number} seed
 * @param {SavedPos} pos
 * @returns {boolean} 저장 성공 여부(용량 초과 등은 false, 무시)
 */
export function writeLayout(storage, version, seed, pos) {
  if (!storage) return false;
  try {
    storage.setItem(LAYOUT_KEY, JSON.stringify({ version: String(version), seed: seed >>> 0, pos }));
    return true;
  } catch {
    return false;
  }
}

/** @param {LayoutStorage|null|undefined} storage */
export function clearLayout(storage) {
  try {
    storage?.removeItem?.(LAYOUT_KEY);
  } catch {
    // 지우기 실패는 무시: 다음 저장이 덮어쓴다
  }
}

// ── 그리기 중단 조건 ────────────────────────────────────────────────

/**
 * @typedef {Object} LoopState
 * @property {boolean} hidden    document.hidden
 * @property {number} alpha
 * @property {boolean} autoSpin  자동회전 설정(켜져 있으면 대기 중이어도 계속 그린다)
 * @property {boolean} wobble    흔들림 설정
 * @property {number} inertia    회전 관성 크기(|spin.y|+|spin.p|)
 * @property {boolean} pointer   포인터 조작 중
 * @property {boolean} flying    flyTo 진행 중
 * @property {boolean} dirty     깨우기 요청(wake) 대기 중
 */

/**
 * 이번 프레임을 그릴지. false면 draw를 건너뛰고 rAF 루프를 멈춘다.
 * 자동회전·흔들림이 켜져 있으면 항상 true(원본 동작 유지).
 * @param {LoopState} s
 * @returns {boolean}
 */
export function shouldDraw(s) {
  if (s.hidden) return false;
  return s.autoSpin || s.wobble || s.alpha > SETTLE_ALPHA || s.inertia > 0 || s.pointer || s.flying || s.dirty;
}
