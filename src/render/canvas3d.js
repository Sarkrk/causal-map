// @ts-check
// 3D 힘그래프 렌더러. 원본 app.js의 물리·투영·안개·라벨·화살표·포인터 제스처를 옮긴 것.
// 물리 필드는 데이터 객체가 아니라 이 파일의 Body(Map<id, Body>)에 둔다.
import { CC, GC, categoriesPresent } from '../store/labels.js';
import { visible, highlight } from '../store/select.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').NodeData} NodeData */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').CorData} CorData */
/** @typedef {import('../store/store.js').Store} Store */

/**
 * @typedef {Object} Body
 * @property {NodeData} d
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
 * @property {Body} a
 * @property {Body} b
 * @property {string} level  인과: 'A'..'D', 상관: ''
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
 * @param {{onPointerDown?: () => void}} [opts]
 * @returns {{zoomBy: (f: number) => void, fit: (anim: boolean) => void, reseed: () => void}}
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
      d, deg, rad: 3.5 + Math.sqrt(deg) * 1.9, ph: i * 2.399,
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
  let alpha = 1;
  let lastAct = -1e9;
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

  /** 원본 recompute(): 가시 노드·링크 갱신 + alpha를 0.5 이상으로. */
  function recompute() {
    vis = visible(graph, store.get());
    VB = bodies.filter((b) => vis.nodes.has(b.d.id));
    VS = new Set(VB);
    VL = vis.causal
      .map((e) => /** @type {Link} */ ({ k: 'c', a: bod(e.src), b: bod(e.dst), level: e.level, r: e.r }))
      .concat(vis.cors.map((c) => /** @type {Link} */ ({ k: 'r', a: bod(c.src), b: bod(c.dst), level: '', r: c.r })));
    alpha = Math.max(alpha, 0.5);
  }

  function seed() {
    bodies.forEach((n) => {
      const c = CP[n.d.cat] || [0, 0, 0];
      n.x = c[0] + (Math.random() - 0.5) * 140;
      n.y = c[1] + (Math.random() - 0.5) * 140;
      n.z = c[2] + (Math.random() - 0.5) * 140;
      n.vx = n.vy = n.vz = 0;
    });
  }

  function tick() {
    const A = VB;
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
    VL.forEach((l) => {
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
      const c = CP[n.d.cat] || [0, 0, 0];
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
    alpha *= 0.985;
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

  function project() {
    const t = (performance.now() - T0) / 1000;
    const a = store.get().prefs.wobble ? 4 : 0;
    VB.forEach((n) => {
      const [x, y, z] = rot(
        n.x + a * Math.sin(t * 0.7 + n.ph),
        n.y + a * Math.cos(t * 0.53 + n.ph * 1.3),
        n.z + a * Math.sin(t * 0.61 + n.ph * 0.7),
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
    const s = Math.max(4, 6 * Math.min(cam.k, 1.6));
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - s * Math.cos(a - 0.42), ey - s * Math.sin(a - 0.42));
    ctx.lineTo(ex - s * Math.cos(a + 0.42), ey - s * Math.sin(a + 0.42));
    ctx.fill();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    project();
    const st = store.get();
    const sel = st.view.selected;
    const hop = st.view.hop;
    const labAll = st.prefs.labAll;
    const hs = sel ? highlight(graph, sel, hop, st.view.dir, st.filters, vis) : null;
    const k = cam.k;
    const zk = Math.max(0.7, Math.min(k, 2.2));
    /** @param {Link} l */
    const isOn = (l) => !!hs && hs.has(l.a.d.id) && hs.has(l.b.d.id) && (hop > 1 || l.a.d.id === sel || l.b.d.id === sel);
    VL.filter((l) => VS.has(l.a) && VS.has(l.b))
      .sort((u, v) => (Number(isOn(u)) - Number(isOn(v))) || (v.a.sz + v.b.sz - (u.a.sz + u.b.sz)))
      .forEach((l) => {
        const on = isOn(l);
        const col = l.k === 'r' ? '#3fb6c9' : GC[/** @type {'A'} */ (l.level)];
        const fog = Math.min(l.a.fog, l.b.fog);
        ctx.globalAlpha = hs ? (on ? 0.95 : 0.03) : (l.k === 'r' ? 0.35 : l.level === 'C' ? 0.25 : 0.6) * fog;
        ctx.strokeStyle = col;
        ctx.lineWidth = (l.level === 'A' ? 2 : l.level === 'B' ? 1.4 : 1) * (on ? 1.7 : 1) * Math.min(1.4, Math.max(0.6, k)) * Math.min(l.a.sf, l.b.sf);
        ctx.setLineDash(l.k === 'r' ? [2, 4] : l.level === 'D' ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(l.a.sx, l.a.sy);
        ctx.lineTo(l.b.sx, l.b.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        if (l.k === 'c' && (on || (!hs && k > 1.2))) arrow(l.a.sx, l.a.sy, l.b.sx, l.b.sy, l.b.rad * l.b.sf * zk, col);
      });

    /** @type {[Body, number, number, number][]} */
    const lab = [];
    VB.slice()
      .sort((u, v) => ((hs ? Number(hs.has(u.d.id)) : 1) - (hs ? Number(hs.has(v.d.id)) : 1)) || (v.sz - u.sz))
      .forEach((n) => {
        const r = n.rad * n.sf * zk;
        const inH = !hs || hs.has(n.d.id);
        if (hs && inH) {
          ctx.globalAlpha = n.d.id === sel ? 0.35 : 0.2;
          ctx.fillStyle = CC[n.d.cat];
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r * (n.d.id === sel ? 2.1 : 1.7) + 3, 0, 6.283);
          ctx.fill();
        }
        ctx.globalAlpha = hs ? (inH ? 1 : 0.06) : n.fog;
        ctx.fillStyle = CC[n.d.cat];
        ctx.beginPath();
        ctx.arc(n.sx, n.sy, hs && !inH ? r * 0.7 : r, 0, 6.283);
        ctx.fill();
        if (n.d.id === sel) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(n.sx, n.sy, r + 4, 0, 6.283);
          ctx.stroke();
        }
        const la = labAll ? 1 : hs ? (inH ? 1 : 0) : Math.max(0, Math.min(1, (k * n.sf * (0.55 + n.deg / 22) - 0.55) / 0.35));
        if (la > 0.02) lab.push([n, n.sx, n.sy + r + 12, la * (hs ? 1 : n.fog)]);
      });
    ctx.font = '12px -apple-system,"Noto Sans KR",sans-serif';
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
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1e1e1e';
      ctx.strokeText(n.d.name, x, y);
      ctx.fillStyle = n.d.id === sel ? '#fff' : '#c9c9c9';
      ctx.fillText(n.d.name, x, y);
    });
    ctx.globalAlpha = 1;
  }

  /** @param {Partial<Cam>} t */
  function flyTo(t) {
    fly = { f: { ...cam }, t, s: performance.now() };
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
    const t = { cx: c[0], cy: c[1], cz: c[2], px: 0, py: 0, k: Math.min(W, H - 150) / (2 * R * 1.3 + 40) };
    if (anim) flyTo(t);
    else Object.assign(cam, t);
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
      const r = Math.max(16, n.rad * n.sf * cam.k + 8);
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
      alpha = Math.max(alpha, 0.3);
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
    },
    { passive: false },
  );

  // 원본 select()/deselect()의 캔버스 쪽 동작. 가시성 재계산은 원본과 같은 조건에서만 한다.
  store.subscribe((st, prev, action) => {
    if (st.filters !== prev.filters || st.prefs !== prev.prefs) recompute();
    if (action.type === 'select') {
      if (!VS.has(bod(action.id))) recompute();
      spin = { y: 0, p: 0 };
      lastAct = performance.now();
      const n = bod(action.id);
      flyTo({ cx: n.x, cy: n.y, cz: n.z, px: 0, py: -H * 0.24, k: Math.max(cam.k, 1.6) });
    } else if (action.type === 'deselect') {
      if (st.prefs.hideOrph) recompute();
    }
  });

  /** 원본 loop() 한 프레임 */
  function loop() {
    const now = performance.now();
    const st = store.get();
    if (alpha > 0.004) tick();
    if (fly) stepFly();
    if (!gs) {
      cam.yaw += spin.y;
      cam.pitch += spin.p;
      spin.y *= 0.93;
      spin.p *= 0.93;
      if (st.prefs.autoSpin && now - lastAct > 2500 && Math.abs(spin.y) < 0.002) cam.yaw += 0.0018;
    }
    cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch));
    draw();
    requestAnimationFrame(loop);
  }

  rs();
  window.addEventListener('resize', rs);
  seed();
  recompute();
  for (let i = 0; i < 350; i++) tick();
  fit(false);
  loop();

  return {
    /** @param {number} f */
    zoomBy(f) {
      zoomAt(f, W / 2, H / 2);
    },
    /** @param {boolean} anim */
    fit(anim) {
      fit(anim);
    },
    reseed() {
      seed();
      alpha = 1;
      for (let i = 0; i < 250; i++) tick();
      fit(true);
    },
  };
}
