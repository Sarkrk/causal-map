// @ts-check
// 3D 힘그래프 렌더러. 원본 app.js의 물리·투영·안개·라벨·화살표·포인터 제스처를 옮긴 것.
// 물리 필드는 데이터 객체가 아니라 이 파일의 Body(Map<id, Body>)에 둔다.
import { CC, GC, categoriesPresent } from '../store/labels.js';
import { visible, emphasis } from '../store/select.js';
import {
  createLayout,
  readLayout,
  writeLayout,
  clearLayout,
  shouldDraw,
  DEFAULT_SEED,
  RESTORE_ALPHA,
  SETTLE_ALPHA,
} from './layout.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').NodeData} NodeData */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').CorData} CorData */
/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('./layout.js').LayoutStorage} LayoutStorage */

/**
 * @typedef {Object} Body
 * @property {NodeData} d
 * @property {string} id   d.id (물리 계산용)
 * @property {string} cat  d.cat (물리 계산용)
 * @property {number} deg
 * @property {number} rad
 * @property {number} ph
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} vx
 * @property {number} vy
 * @property {number} vz
 * @property {number|null} fx
 * @property {number|null} fy
 * @property {number|null} fz
 * @property {number} sx
 * @property {number} sy
 * @property {number} sf
 * @property {number} sz
 * @property {number} fog
 */

/**
 * @typedef {Object} Link
 * @property {'c'|'r'} k
 * @property {string} id     인과: 엣지 id, 상관: ''
 * @property {Body} a
 * @property {Body} b
 * @property {string} level  인과: 'A'..'D', 상관: ''
 * @property {'+'|'-'|null} [sub]  인과: B 등급 세분(B+/B-), 그 밖은 없음
 * @property {number|null} r
 */

/**
 * @typedef {Object} Cam
 * @property {number} cx
 * @property {number} cy
 * @property {number} cz
 * @property {number} k
 * @property {number} yaw
 * @property {number} pitch
 * @property {number} px
 * @property {number} py
 */

/**
 * @typedef {Object} Gesture
 * @property {boolean} pinch
 * @property {number} t
 * @property {number} x0
 * @property {number} y0
 * @property {number} lx
 * @property {number} ly
 * @property {number} lt
 * @property {Body|null} node
 * @property {boolean} moved
 * @property {boolean} pan
 * @property {number} d
 * @property {number} mx
 * @property {number} my
 */

const F = 650;

/** 기본 배치 저장소(localStorage). 접근이 막혀 있으면 undefined. */
/** @returns {LayoutStorage|undefined} */
function safeStorage() {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {Partial<Gesture>} o
 * @returns {Gesture}
 */
function gesture(o) {
  return {
    pinch: false, t: 0, x0: 0, y0: 0, lx: 0, ly: 0, lt: 0, node: null, moved: false, pan: false, d: 0, mx: 0, my: 0,
    ...o,
  };
}

/**
 * 3D 캔버스를 만들고 시작한다.
 * @param {HTMLCanvasElement} cv
 * @param {Graph} graph
 * @param {Store} store
 * @param {{onPointerDown?: () => void, storage?: LayoutStorage|null, version?: string}} [opts]
 *   storage: 배치 저장소(기본 localStorage, 테스트는 가짜 주입). version: meta.version(다르면 저장 배치 무시).
 * @returns {{zoomBy: (f: number) => void, fit: (anim: boolean) => void, recenter: () => void, reseed: () => void, isRunning: () => boolean}}
 */
export function createCanvas3D(cv, graph, store, opts = {}) {
  const ctx0 = cv.getContext('2d');
  if (!ctx0) throw new Error('2d context unavailable');
  const ctx = ctx0;
  let W = 0;
  let H = 0;
  let DPR = 1;

  const cats = categoriesPresent(graph);
  /** @type {Record<string, number[]>} */
  const CP = {};
  cats.forEach((k, i) => {
    const y = 1 - ((i + 0.5) / cats.length) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399;
    CP[k] = [Math.cos(a) * r * 170, y * 170, Math.sin(a) * r * 170];
  });

  /** @type {Body[]} */
  const bodies = graph.nodes.map((d, i) => {
    const deg = graph.deg.get(d.id) ?? 0;
    return {
      d, id: d.id, cat: d.cat, deg, rad: 3.5 + Math.sqrt(deg) * 1.9, ph: i * 2.399,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: null, fy: null, fz: null,
      sx: 0, sy: 0, sf: 1, sz: 0, fog: 1,
    };
  });
  /** @type {Map<string, Body>} */
  const B = new Map(bodies.map((b) => [b.d.id, b]));
  /** @param {string} id */
  const bod = (id) => {
    const b = B.get(id);
    if (!b) throw new Error('unknown node ' + id);
    return b;
  };

  /** @type {Cam} */
  const cam = { cx: 0, cy: 0, cz: 0, k: 1, yaw: 0.5, pitch: -0.3, px: 0, py: 0 };
  let spin = { y: 0, p: 0 };
  let lastAct = -1e9;
  // 배치: 저장 좌표가 있고 버전이 같으면 그 좌표로 시작(alpha 낮게), 아니면 시드 배치(DEFAULT_SEED).
  const storage = opts.storage !== undefined ? opts.storage : safeStorage();
  const version = String(opts.version ?? '');
  const saved = readLayout(storage, version);
  const layout = createLayout({
    bodies,
    links: [],
    centers: CP,
    seed: saved ? saved.seed : DEFAULT_SEED,
    restore: saved ? saved.pos : null,
    alpha: saved ? RESTORE_ALPHA : 1,
  });
  /** 배치 좌표가 바뀌었고 아직 저장 전. alpha가 SETTLE_ALPHA 아래로 내려간 직후 1회 저장한다. */
  let saveDue = true;
  /** 깨우기 요청(wake) 대기: 다음 프레임 한 번은 그린다. */
  let wakeFlag = false;
  /** rAF 루프가 돌고 있는지. */
  let running = false;
  /** @type {{f: Cam, t: Partial<Cam>, s: number}|null} */
  let fly = null;
  const T0 = performance.now();

  /** 현재 가시 집합. recompute()가 갱신한다. */
  let vis = visible(graph, store.get());
  /** @type {Body[]} */
  let VB = [];
  /** @type {Set<Body>} */
  let VS = new Set();
  /** @type {Link[]} */
  let VL = [];

  /** 가시 노드·링크를 다시 모은다(위치는 그대로). */
  function refresh() {
    vis = visible(graph, store.get());
    VB = bodies.filter((b) => vis.nodes.has(b.d.id));
    VS = new Set(VB);
    VL = vis.causal
      .map((e) => /** @type {Link} */ ({ k: 'c', id: e.id, a: bod(e.src), b: bod(e.dst), level: e.level, sub: e.sub, r: e.r }))
      .concat(vis.cors.map((c) => /** @type {Link} */ ({ k: 'r', id: '', a: bod(c.src), b: bod(c.dst), level: '', r: c.r })));
    layout.setActive(VB, VL);
  }

  /** 원본 recompute(): 가시 노드·링크 갱신 + alpha를 0.5 이상으로. */
  function recompute() {
    refresh();
    layout.reheat(0.5);
    saveDue = true;
  }

  /** @param {number} x @param {number} y @param {number} z @returns {[number, number, number]} */
  function rot(x, y, z) {
    x -= cam.cx;
    y -= cam.cy;
    z -= cam.cz;
    const c1 = Math.cos(cam.yaw);
    const s1 = Math.sin(cam.yaw);
    const c2 = Math.cos(cam.pitch);
    const s2 = Math.sin(cam.pitch);
    const x1 = x * c1 + z * s1;
    const z1 = -x * s1 + z * c1;
    return [x1, y * c2 - z1 * s2, y * s2 + z1 * c2];
  }

  /** @param {number} x1 @param {number} y1 @param {number} z2 @returns {[number, number, number]} */
  function unrot(x1, y1, z2) {
    const c1 = Math.cos(cam.yaw);
    const s1 = Math.sin(cam.yaw);
    const c2 = Math.cos(cam.pitch);
    const s2 = Math.sin(cam.pitch);
    const y = y1 * c2 + z2 * s2;
    const z1 = -y1 * s2 + z2 * c2;
    return [x1 * c1 - z1 * s1 + cam.cx, y + cam.cy, x1 * s1 + z1 * c1 + cam.cz];
  }

  /** 회전 중심을 항상 보이는 전체 노드의 무게중심으로 둔다. */
  function pivot() {
    const m = VB.length;
    if (!m) return;
    let x = 0, y = 0, z = 0;
    for (const n of VB) { x += n.x; y += n.y; z += n.z; }
    cam.cx = x / m; cam.cy = y / m; cam.cz = z / m;
  }

  /** 월드 좌표 한 점이 화면 (0, offY) 근처에 오도록 하는 px·py. 회전 중심은 그대로 둔다. */
  function centerFor(wx, wy, wz, k, offY) {
    pivot();
    const [x1, y1, z2] = rot(wx, wy, wz);
    const f = F / (F + Math.max(z2, -F * 0.8));
    return { px: -x1 * f * k, py: offY - y1 * f * k, k };
  }

  function project() {
    pivot();
    const t = (performance.now() - T0) / 1000;
    const a = store.get().prefs.wobble ? 4 : 0;
    const ie = 1 - Math.pow(1 - Math.min(1, t / 1.3), 3);
    const SC = 0.35 + 0.65 * ie; // 첫 화면: 중심에서 퍼지며 나타남
    if (ie < 1) wake();
    VB.forEach((n) => {
      const [x, y, z] = rot(
        cam.cx + (n.x - cam.cx + a * Math.sin(t * 0.7 + n.ph)) * SC,
        cam.cy + (n.y - cam.cy + a * Math.cos(t * 0.53 + n.ph * 1.3)) * SC,
        cam.cz + (n.z - cam.cz + a * Math.sin(t * 0.61 + n.ph * 0.7)) * SC,
      );
      const f = F / (F + Math.max(z, -F * 0.8));
      n.sx = W / 2 + cam.px + x * f * cam.k;
      n.sy = H / 2 + cam.py + y * f * cam.k;
      n.sf = f;
      n.sz = z;
      n.fog = Math.max(0.28, Math.min(1, 1 - z / 480));
    });
  }

  /** @param {Body[]} A */
  function bbox(A) {
    return A;
  }

  function rs() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
  }

  /**
   * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
   * @param {number} r @param {string} col
   */
  function arrow(x1, y1, x2, y2, r, col) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const ex = x2 - Math.cos(a) * (r + 2);
    const ey = y2 - Math.sin(a) * (r + 2);
    const s = Math.max(3, 6 * Math.min(Math.max(0.4, Math.pow(cam.k, 0.75)), 1.6));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - s * Math.cos(a - 0.42), ey - s * Math.sin(a - 0.42));
    ctx.lineTo(ex - s * Math.cos(a + 0.42), ey - s * Math.sin(a + 0.42));
    ctx.fill();
  }


  const sprites = new Map();
  const SP = 192;
  /** @param {string} hex @param {number} f  f<0 어둡게, f>0 밝게 */
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
      Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f),
    );
    return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
  }
  /** 범주별 평평한 단색 원 스프라이트(얇은 어두운 테두리)를 한 번만 그려 두고 drawImage로 재사용한다. */
  /** @param {string} cat */
  function sprite(cat) {
    let c = sprites.get(cat);
    if (c) return c;
    const hex = CC[/** @type {'Policy'} */ (cat)] || '#8a8f98';
    c = document.createElement('canvas');
    c.width = c.height = SP;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const m = SP / 2;
    const R = SP * 0.44;
    g.fillStyle = hex;
    g.globalAlpha = 0.28;
    g.beginPath();
    g.arc(m, m, R, 0, 6.283);
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = SP * 0.06;
    g.strokeStyle = hex;
    g.beginPath();
    g.arc(m, m, R - g.lineWidth / 2, 0, 6.283);
    g.stroke();
    g.beginPath();
    g.arc(m, m, R * 0.42, 0, 6.283);
    g.fill();
    sprites.set(cat, c);
    return c;
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    project();
    const st = store.get();
    const sel = st.view.selected;
    const hop = st.view.hop;
    const labAll = st.prefs.labAll;
    // trace(루프·경로 탭에서 고른 것)가 있으면 그 노드·엣지만 강조. 없으면 기존 선택 강조와 같다.
    const em = emphasis(graph, st, vis);
    const hs = em ? em.nodes : null;
    const eIds = em ? em.edgeIds : null;
    const k = cam.k;
    // 축소 시 노드가 상대적으로 커 보이지 않도록 반지름도 줌에 비례해 작아지게 한다(완만하게, 하한 0.22).
    const zk = Math.max(0.4, Math.min(Math.pow(k, 0.75), 2.2));
    /** @param {Link} l */
    const isOn = (l) =>
      !!hs &&
      hs.has(l.a.d.id) &&
      hs.has(l.b.d.id) &&
      (eIds ? l.k === 'c' && eIds.has(l.id) : hop > 1 || l.a.d.id === sel || l.b.d.id === sel);
    VL.filter((l) => VS.has(l.a) && VS.has(l.b))
      .sort((u, v) => (Number(isOn(u)) - Number(isOn(v))) || (v.a.sz + v.b.sz - (u.a.sz + u.b.sz)))
      .forEach((l) => {
        const on = isOn(l);
        const col = l.k === 'r' ? '#7d8da0' : GC[/** @type {'A'} */ (l.level)];
        const fog = Math.min(l.a.fog, l.b.fog);
        // B-는 같은 B색에서 알파만 낮춰 흐리게(B+와 구분). 등급 가중치·굵기는 그대로.
        const dimB = l.level === 'B' && l.sub === '-' ? 0.72 : 1;
        ctx.globalAlpha = (hs ? (on ? 0.95 : 0.03) : (l.k === 'r' ? 0.28 : l.level === 'C' ? 0.18 : 0.42)) * dimB * fog;
        ctx.strokeStyle = col;
        ctx.lineWidth = (l.level === 'A' ? 1.4 : l.level === 'B' ? 1 : 0.8) * (on ? 1.8 : 1) * Math.min(1.4, Math.max(0.6, k)) * Math.min(l.a.sf, l.b.sf);
        if (l.k === 'c' && (on || !hs)) {
          const gr = ctx.createLinearGradient(l.a.sx, l.a.sy, l.b.sx, l.b.sy);
          gr.addColorStop(0, col + '55');
          gr.addColorStop(1, col);
          ctx.strokeStyle = gr;
        }
        ctx.setLineDash(l.k === 'r' ? [2, 4] : l.level === 'D' ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(l.a.sx, l.a.sy);
        ctx.lineTo(l.b.sx, l.b.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        if (l.k === 'c' && on) {
          const u = (performance.now() / 1100 + l.a.ph) % 1;
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(l.a.sx + (l.b.sx - l.a.sx) * u, l.a.sy + (l.b.sy - l.a.sy) * u, 1.8 * Math.min(1.5, Math.max(0.8, k)), 0, 6.283);
          ctx.fill();
        }
        if (l.k === 'c' && (on || (!hs && k > 1.2))) arrow(l.a.sx, l.a.sy, l.b.sx, l.b.sy, l.b.rad * l.b.sf * zk * 1.5, col);
      });

    /** @type {[Body, number, number, number][]} */
    const lab = [];
    VB.slice()
      .sort((u, v) => ((hs ? Number(hs.has(u.d.id)) : 1) - (hs ? Number(hs.has(v.d.id)) : 1)) || (v.sz - u.sz))
      .forEach((n) => {
        const r = n.rad * n.sf * zk * 1.5; // 화면상 실제 반지름
        const inH = !hs || hs.has(n.d.id);
        if (hs && inH) {
          ctx.globalAlpha = n.d.id === sel ? 0.5 : 0.3;
          ctx.strokeStyle = CC[n.d.cat];
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 3.5, 0, 6.283);
          ctx.stroke();
        }
        if (!hs && r > 7) {
          ctx.globalAlpha = 0.1 * n.fog;
          ctx.fillStyle = CC[n.d.cat];
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r * 1.55, 0, 6.283);
          ctx.fill();
        }
        ctx.globalAlpha = hs ? (inH ? 1 : 0.06) : n.fog;
        const rr = hs && !inH ? r * 0.7 : r;
        if (rr < 2.6) {
          // 아주 작을 땐 스프라이트 대신 단색 점(번짐 방지)
          ctx.fillStyle = CC[n.d.cat];
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, Math.max(rr, 1.1), 0, 6.283);
          ctx.fill();
        } else {
          const d = rr / 0.44; // 스프라이트의 본체 반지름이 44%
          ctx.drawImage(sprite(n.d.cat), n.sx - d / 2, n.sy - d / 2, d, d);
        }
        if (n.d.id === sel) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 4, 0, 6.283);
          ctx.stroke();
          ctx.strokeStyle = '#e6e8ec';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([6, 5]);
          ctx.lineDashOffset = -performance.now() / 55;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 9, 0, 6.283);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
          wake();
        }
        const la = labAll ? 1 : hs ? (inH ? 1 : 0) : Math.max(0, Math.min(1, (k * n.sf * (0.55 + n.deg / 22) - 0.55) / 0.35));
        if (la > 0.02) lab.push([n, n.sx, n.sy + r + 12, la * (hs ? 1 : 0.8 + 0.2 * n.fog)]);
      });
    ctx.font = '500 11px ui-monospace,Menlo,Consolas,"Noto Sans KR",monospace';
    ctx.textAlign = 'center';
    lab.sort((u, v) => Number(v[0].d.id === sel) - Number(u[0].d.id === sel) || ((u[0].sz - v[0].sz) * 0.02 + (v[0].deg - u[0].deg)));
    /** @type {number[][]} */
    const box = [];
    lab.forEach(([n, x, y, a]) => {
      const w = ctx.measureText(n.d.name).width / 2 + 3;
      const bb = [x - w, y - 11, x + w, y + 3];
      if (n.d.id !== sel && box.some((o) => bb[0] < o[2] && bb[2] > o[0] && bb[1] < o[3] && bb[3] > o[1])) return;
      box.push(bb);
      ctx.globalAlpha = a;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(10,11,13,.92)';
      ctx.lineJoin = 'round';
      ctx.strokeText(n.d.name, x, y);
      ctx.fillStyle = n.d.id === sel ? '#ffffff' : '#cfd2d6';
      ctx.fillText(n.d.name, x, y);
    });
    ctx.globalAlpha = 1;
    {
      const cx = W / 2 + cam.px;
      const cy = H / 2 + cam.py;
      ctx.strokeStyle = 'rgba(255,255,255,.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, 6.283);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(cx + dx * 5, cy + dy * 5);
        ctx.lineTo(cx + dx * 15, cy + dy * 15);
      }
      ctx.stroke();
      const ro = typeof document !== 'undefined' ? document.getElementById('ro') : null;
      if (ro) {
        const deg = (v) => ((Math.round(v * 57.2958) % 360) + 360) % 360;
        ro.textContent = `YAW ${String(deg(cam.yaw)).padStart(3, '0')}°\nPIT ${Math.round(cam.pitch * 57.2958)}°\nZOOM ×${cam.k.toFixed(2)}`;
      }
    }
  }

  /** @param {Partial<Cam>} t */
  function flyTo(t) {
    fly = { f: { ...cam }, t, s: performance.now() };
    wake();
  }

  function stepFly() {
    if (!fly) return;
    const p = Math.min(1, (performance.now() - fly.s) / 450);
    const e = 1 - Math.pow(1 - p, 3);
    /** @type {(keyof Cam)[]} */
    const keys = /** @type {(keyof Cam)[]} */ (Object.keys(fly.t));
    for (const key of keys) {
      const to = fly.t[key];
      if (to !== undefined) cam[key] = fly.f[key] + (to - fly.f[key]) * e;
    }
    if (p >= 1) fly = null;
  }

  /** @param {boolean} anim */
  function fit(anim) {
    const A = VB;
    if (!A.length) return;
    const c = [0, 0, 0];
    A.forEach((n) => {
      c[0] += n.x;
      c[1] += n.y;
      c[2] += n.z;
    });
    c.forEach((v, i) => (c[i] = v / A.length));
    let R = 0;
    A.forEach((n) => (R = Math.max(R, Math.hypot(n.x - c[0], n.y - c[1], n.z - c[2]))));
    const t = { px: 0, py: 0, k: Math.min(W, H - 150) / (2 * R * 1.3 + 40) };
    if (anim) flyTo(t);
    else Object.assign(cam, t);
    wake();
  }

  /**
   * 주어진 노드 id들(화면에 보이는 것만)이 모두 들어오도록 카메라를 맞춘다. 선택 노드 이동과 같은 식으로 살짝 위로 올린다.
   * @param {string[]} ids
   */
  function fitIds(ids) {
    /** @type {Body[]} */
    const A = [];
    for (const id of ids) {
      const b = B.get(id);
      if (b && VS.has(b)) A.push(b);
    }
    if (!A.length) return;
    const c = [0, 0, 0];
    A.forEach((n) => {
      c[0] += n.x;
      c[1] += n.y;
      c[2] += n.z;
    });
    c.forEach((v, i) => (c[i] = v / A.length));
    let R = 0;
    A.forEach((n) => (R = Math.max(R, Math.hypot(n.x - c[0], n.y - c[1], n.z - c[2]))));
    const k = Math.min(W, H - 150) / (2 * R * 1.3 + 40);
    flyTo(centerFor(c[0], c[1], c[2], Math.max(0.15, Math.min(3, k)), -H * 0.24));
  }

  /** @param {number} f @param {number} sx @param {number} sy */
  function zoomAt(f, sx, sy) {
    const k2 = Math.max(0.15, Math.min(6, cam.k * f));
    const X = (sx - W / 2 - cam.px) / cam.k;
    const Y = (sy - H / 2 - cam.py) / cam.k;
    cam.px = sx - W / 2 - X * k2;
    cam.py = sy - H / 2 - Y * k2;
    cam.k = k2;
  }

  /** @param {number} sx @param {number} sy @returns {Body|null} */
  function hit(sx, sy) {
    /** @type {Body|null} */
    let best = null;
    let bd = 1e9;
    VB.forEach((n) => {
      const d = Math.hypot(n.sx - sx, n.sy - sy);
      const r = Math.max(14, n.rad * n.sf * Math.max(0.4, Math.min(Math.pow(cam.k, 0.75), 2.2)) * 1.5 + 8);
      const sc = d + n.sz * 0.02;
      if (d < r && sc < bd) {
        bd = sc;
        best = n;
      }
    });
    return best;
  }

  /** @type {Map<number, {x: number, y: number}>} */
  const P = new Map();
  /** @type {Gesture|null} */
  let gs = null;

  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    wake();
    P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    opts.onPointerDown?.();
    lastAct = performance.now();
    spin = { y: 0, p: 0 };
    fly = null;
    if (P.size === 1) {
      const n = hit(e.clientX, e.clientY);
      gs = gesture({
        t: performance.now(), x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY,
        lt: performance.now(), node: n, moved: false,
        pan: e.pointerType === 'mouse' && (e.shiftKey || e.button === 2),
      });
    } else if (P.size === 2) {
      if (gs && gs.node) {
        gs.node.fx = gs.node.fy = gs.node.fz = null;
      }
      const [a, b] = [...P.values()];
      gs = gesture({
        pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, moved: true,
      });
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!P.has(e.pointerId) || !gs) return;
    P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastAct = performance.now();
    wake();
    if (gs.pinch && P.size >= 2) {
      const [a, b] = [...P.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      cam.px += mx - gs.mx;
      cam.py += my - gs.my;
      zoomAt(d / gs.d, mx, my);
      gs.d = d;
      gs.mx = mx;
      gs.my = my;
      return;
    }
    if (Math.hypot(e.clientX - gs.x0, e.clientY - gs.y0) > 7) gs.moved = true;
    if (!gs.moved) return;
    const dx = e.clientX - gs.lx;
    const dy = e.clientY - gs.ly;
    if (gs.node) {
      const n = gs.node;
      const [x1, y1, z2] = rot(n.x, n.y, n.z);
      const s = cam.k * n.sf;
      const [wx, wy, wz] = unrot(x1 + dx / s, y1 + dy / s, z2);
      n.fx = n.x = wx;
      n.fy = n.y = wy;
      n.fz = n.z = wz;
      layout.reheat(0.3);
      saveDue = true;
    } else if (gs.pan) {
      cam.px += dx;
      cam.py += dy;
    } else {
      const vy = -dx * 0.006;
      const vp = dy * 0.006;
      cam.yaw += vy;
      cam.pitch += vp;
      spin = { y: Math.max(-0.05, Math.min(0.05, vy * 0.45)), p: Math.max(-0.04, Math.min(0.04, vp * 0.45)) };
    }
    gs.lx = e.clientX;
    gs.ly = e.clientY;
    gs.lt = performance.now();
  });

  /** @param {PointerEvent} e */
  function up(e) {
    if (!P.has(e.pointerId)) return;
    P.delete(e.pointerId);
    wake();
    if (!gs) return;
    if (!gs.pinch && !gs.moved && performance.now() - gs.t < 500) {
      if (gs.node) store.dispatch({ type: 'select', id: gs.node.d.id });
      else store.dispatch({ type: 'deselect' });
    }
    if (gs.node) {
      gs.node.fx = gs.node.fy = gs.node.fz = null;
    }
    if (gs.lt && performance.now() - gs.lt > 90) spin = { y: 0, p: 0 };
    if (P.size === 0) gs = null;
    else if (P.size === 1) {
      const [p] = [...P.values()];
      gs = gesture({ t: 0, x0: p.x, y0: p.y, lx: p.x, ly: p.y, node: null, moved: true });
    }
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      lastAct = performance.now();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      wake();
    },
    { passive: false },
  );

  // 원본 select()/deselect()의 캔버스 쪽 동작. 가시성 재계산은 원본과 같은 조건에서만 한다.
  store.subscribe((st, prev, action) => {
    wake();
    if (st.filters !== prev.filters || st.prefs !== prev.prefs) recompute();
    if (action.type === 'select') {
      if (!VS.has(bod(action.id))) recompute();
      spin = { y: 0, p: 0 };
      lastAct = performance.now();
      const n = bod(action.id);
      flyTo(centerFor(n.x, n.y, n.z, Math.max(cam.k, 1.6), -H * 0.24));
    } else if (action.type === 'deselect') {
      if (st.prefs.hideOrph) recompute();
    } else if (action.type === 'setTrace' && st.view.trace) {
      lastAct = performance.now();
      fitIds(st.view.trace.nodes);
    }
  });

  /** 원본 loop()의 물리·회전 한 단계(그리기 제외). */
  function step() {
    const now = performance.now();
    const st = store.get();
    if (layout.alpha > SETTLE_ALPHA) layout.tick();
    if (fly) stepFly();
    if (!gs) {
      cam.yaw += spin.y;
      cam.pitch += spin.p;
      spin.y *= 0.93;
      spin.p *= 0.93;
      if (Math.abs(spin.y) < 1e-6) spin.y = 0;
      if (Math.abs(spin.p) < 1e-6) spin.p = 0;
      if (st.prefs.autoSpin && now - lastAct > 2500 && Math.abs(spin.y) < 0.002) cam.yaw += 0.0018;
    }
    cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch));
  }

  /** 정지 직후 1회 배치 저장. */
  function maybeSave() {
    if (saveDue && layout.alpha <= SETTLE_ALPHA) {
      saveDue = false;
      writeLayout(storage, version, layout.seed, layout.positions());
    }
  }

  /** @returns {import('./layout.js').LoopState} */
  function loopState() {
    const st = store.get();
    return {
      hidden: typeof document !== 'undefined' && document.hidden,
      alpha: layout.alpha,
      autoSpin: st.prefs.autoSpin,
      wobble: st.prefs.wobble,
      inertia: Math.abs(spin.y) + Math.abs(spin.p),
      pointer: P.size > 0 || gs !== null,
      flying: fly !== null,
      dirty: wakeFlag,
    };
  }

  /** 원본 loop() 한 프레임. 멈출 조건이면 draw 없이 루프를 끝낸다(rAF 재등록 안 함). */
  function loop() {
    maybeSave();
    if (!shouldDraw(loopState())) {
      running = false;
      return;
    }
    step();
    draw();
    wakeFlag = false;
    maybeSave();
    requestAnimationFrame(loop);
  }

  /** 루프를 깨운다. 멈춰 있었으면 다음 프레임에 다시 돈다. */
  function wake() {
    wakeFlag = true;
    if (running) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    running = true;
    requestAnimationFrame(loop);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) wake();
    });
  }

  rs();
  window.addEventListener('resize', () => {
    rs();
    wake();
  });
  refresh();
  if (!saved) for (let i = 0; i < 350; i++) layout.tick();
  running = true;
  fit(false);
  loop();

  return {
    /** @param {number} f */
    zoomBy(f) {
      zoomAt(f, W / 2, H / 2);
      wake();
    },
    /** @param {boolean} anim */
    fit(anim) {
      fit(anim);
    },
    /** 줌은 그대로 두고 화면 이동(px·py)만 0으로: 전체 구조의 중심(과녁)이 화면 가운데로 온다. */
    recenter() {
      flyTo({ px: 0, py: 0 });
    },
    reseed() {
      layout.reseed(layout.nextSeed());
      clearLayout(storage);
      for (let i = 0; i < 250; i++) layout.tick();
      saveDue = true;
      fit(true);
      wake();
    },
    /** 테스트용 읽기 전용: rAF 루프가 돌고 있는지. */
    isRunning() {
      return running;
    },
  };
}
