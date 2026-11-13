// @ts-check
// 관계도(SVG) 빌드. 원본 flat()·wrap()·esc()와 같은 배치·수치·문구.
import { CC, GC } from '../store/labels.js';
import { causalVisible } from '../store/select.js';
import { SIGN_LABEL } from '../engine/graph.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').NodeData} NodeData */
/** @typedef {import('../store/store.js').AppState} AppState */

/**
 * HTML 이스케이프(원본 esc와 같은 규칙: & < > ").
 * @param {unknown} s
 * @returns {string}
 */
export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/**
 * 긴 이름을 두 줄로 나눈다(원본 wrap과 같음).
 * @param {string} t
 * @param {number} m
 * @returns {string[]}
 */
export function wrap(t, m) {
  if (t.length <= m) return [t];
  let c = -1;
  let best = 1e9;
  for (let i = 2; i < t.length - 1; i++) {
    if (' ·/()'.includes(t[i]) && Math.abs(i - t.length / 2) < best) {
      best = Math.abs(i - t.length / 2);
      c = i;
    }
  }
  if (c < 0 || c > m + 2) c = m;
  const a = t.slice(0, c + (t[c] === ' ' ? 0 : ' ·/'.includes(t[c]) ? 1 : 0)).trim();
  const b = t.slice(a.length).trim();
  return [a, b.length > m + 2 ? b.slice(0, m + 1) + '…' : b];
}

/**
 * 관계도 HTML.
 * 방향: 'up'이면 원인 열 + 가운데, 'down'이면 가운데 + 결과 열, 'both'면 전부(원본).
 * @param {Graph} graph
 * @param {AppState} state
 * @param {string} nid  가운데 노드 id
 * @returns {string}
 */
export function flatHtml(graph, state, nid) {
  const n = graph.byId.get(nid);
  if (!n) return '';
  const { hop, dir, flatAll } = state.view;
  const E = graph.edges.filter((e) => causalVisible(graph, e, state.filters));
  /** @param {EdgeData} l */
  const rk = (l) => 'ABCD'.indexOf(l.level) * 10 - Math.abs(l.r || 0);
  /** @param {EdgeData} x @param {EdgeData} y */
  const byRk = (x, y) => rk(x) - rk(y);
  /** @param {string[]} ids */
  const uq = (ids) =>
    [...new Set(ids)].map((id) => graph.byId.get(id)).filter((x) => x !== undefined);

  const inE = E.filter((l) => l.dst === nid && l.src !== nid).sort(byRk);
  const outE = E.filter((l) => l.src === nid && l.dst !== nid).sort(byRk);
  const C1 = uq(inE.map((l) => l.src));
  const E1 = uq(outE.map((l) => l.dst));
  const cap = flatAll ? 99 : 8;
  const c1 = C1.slice(0, cap);
  const e1 = E1.slice(0, cap);
  const more = C1.length + E1.length - c1.length - e1.length;

  /** @type {NodeData[][]} */
  let cols;
  /** @type {EdgeData[]} */
  let links;
  if (hop === 1) {
    if (dir === 'up') {
      cols = [c1, [n]];
      links = inE;
    } else if (dir === 'down') {
      cols = [[n], e1];
      links = outE;
    } else {
      cols = [c1, [n], e1];
      links = inE.concat(outE);
    }
  } else {
    const s1 = new Set(c1.map((x) => x.id));
    const t1 = new Set(e1.map((x) => x.id));
    const i2 = E.filter((l) => s1.has(l.dst) && l.src !== nid && !s1.has(l.src)).sort(byRk);
    const o2 = E.filter((l) => t1.has(l.src) && l.dst !== nid && !t1.has(l.dst)).sort(byRk);
    const I2 = uq(i2.map((l) => l.src)).slice(0, flatAll ? 40 : 10);
    const O2 = uq(o2.map((l) => l.dst)).slice(0, flatAll ? 40 : 10);
    if (dir === 'up') {
      cols = [I2, c1, [n]];
      links = i2.concat(inE);
    } else if (dir === 'down') {
      cols = [[n], e1, O2];
      links = outE.concat(o2);
    } else {
      cols = [I2, c1, [n], e1, O2];
      links = i2.concat(inE, outE, o2);
    }
  }

  // trace(루프·경로)가 있으면 그 노드와 연속 노드 쌍(방향 일치) 엣지만 강조, 나머지는 흐리게. 없으면 클래스를 붙이지 않는다.
  const tr = state.view.trace;
  const trNodes = new Set(tr ? tr.nodes : []);
  /** @type {Set<string>} */
  const trPairs = new Set();
  if (tr) {
    for (let i = 0; i + 1 < tr.nodes.length; i++) trPairs.add(tr.nodes[i] + '\u0001' + tr.nodes[i + 1]);
    if (tr.kind === 'loop' && tr.nodes.length > 1) trPairs.add(tr.nodes[tr.nodes.length - 1] + '\u0001' + tr.nodes[0]);
  }
  /** @param {boolean} hit */
  const trCls = (hit) => (tr ? (hit ? 'tr-on' : 'tr-dim') : '');

  const nc = cols.length;
  const bw = hop === 1 ? Math.max(92, Math.floor((Math.min(innerWidth, 520) - 40 - 2 * 28) / 3)) : 92;
  const gap = hop === 1 ? 28 : 22;
  const rh = 42;
  const bh = 34;
  const Wd = nc * bw + (nc - 1) * gap + 12;
  const mx = Math.max(1, ...cols.map((c) => c.length));
  const Hd = mx * rh + 12;
  /** @type {Map<string, number[]>[]} */
  const pos = cols.map(() => new Map());
  cols.forEach((c, i) => {
    const off = (Hd - c.length * rh) / 2;
    c.forEach((x, j) => pos[i].set(x.id, [6 + i * (bw + gap), off + j * rh + (rh - bh) / 2]));
  });

  let sv = '';
  const mid = Math.floor(nc / 2);
  /** @type {[number, number, string, string, string][]} */
  const badge = [];
  for (let i = 0; i < nc - 1; i++) {
    for (const l of links) {
      const A = pos[i].get(l.src);
      const B = pos[i + 1].get(l.dst);
      if (!A || !B) continue;
      const x1 = A[0] + bw;
      const y1 = A[1] + bh / 2;
      const x2 = B[0];
      const y2 = B[1] + bh / 2;
      const cx = (x1 + x2) / 2;
      const col = GC[/** @type {'A'} */ (l.level)];
      const on = i === mid - 1 || i === mid;
      const ecls = trCls(trPairs.has(l.src + '\u0001' + l.dst));
      sv += `<path${ecls ? ` class="${ecls}"` : ''} d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2 - 4},${y2}" fill="none" stroke="${col}" stroke-opacity="${on ? 0.85 : 0.45}" stroke-width="${l.level === 'A' ? 2.2 : l.level === 'B' ? 1.6 : 1.1}" ${l.level === 'D' ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#ar${l.level})"/>`;
      if (on) badge.push([i === mid - 1 ? x1 : x2, i === mid - 1 ? y1 : y2, col, SIGN_LABEL[l.sign], ecls]);
    }
  }
  /** @param {[number, number, string, string, string]} b */
  const badgeSvg = ([x, y, col, sg, cls]) =>
    `<g${cls ? ` class="${cls}"` : ''}><circle cx="${x}" cy="${y}" r="7.5" fill="#262626" stroke="${col}" stroke-width="1.2"/><text x="${x}" y="${y + 3.6}" font-size="11" fill="${col}" text-anchor="middle" font-weight="700">${esc(sg)}</text></g>`;
  badge.forEach((b) => (sv += badgeSvg(b)));
  const bdg = badge.splice(0);
  cols.forEach((c, i) =>
    c.forEach((x) => {
      const [X, Y] = /** @type {number[]} */ (pos[i].get(x.id));
      const me = x.id === nid;
      const ls = wrap(x.name, hop === 1 && bw > 100 ? Math.floor(bw / 12) : 7);
      const col = CC[x.cat];
      const attr = me ? '' : ` data-act="go" data-id="${esc(x.id)}"`;
      const ncls = trCls(trNodes.has(x.id));
      sv +=
        `<g class="bx${ncls ? ' ' + ncls : ''}"${attr}><rect x="${X}" y="${Y}" width="${bw}" height="${bh}" rx="8" fill="${me ? col : col + '2e'}" stroke="${col}" stroke-width="${me ? 0 : 1.2}"/>` +
        ls
          .map(
            (t, k) =>
              `<text x="${X + bw / 2}" y="${Y + bh / 2 + (ls.length === 1 ? 4 : k === 0 ? -2 : 10)}" font-size="${me ? 12 : 11}" font-weight="${me ? 700 : 400}" fill="${me ? '#111' : '#e6e6e6'}" text-anchor="middle">${esc(t)}</text>`,
          )
          .join('') +
        `</g>`;
    }),
  );
  bdg.forEach((b) => (sv += badgeSvg(b)));

  const mk = Object.entries(GC)
    .map(
      ([k, c]) =>
        `<marker id="ar${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="${c}"/></marker>`,
    )
    .join('');
  const leftLab = hop === 1 ? '원인' : '2단계 원인';
  const rightLab = hop === 1 ? '결과' : '2단계 결과';
  const head =
    `<div class="flh">` +
    (dir !== 'down' ? `<span>← ${leftLab} ${C1.length}</span>` : '<span></span>') +
    `<span>${hop}단계 · 표시 필터 적용</span>` +
    (dir !== 'up' ? `<span>${rightLab} ${E1.length} →</span>` : '<span></span>') +
    `</div>`;
  const reachable = dir === 'up' ? c1.length : dir === 'down' ? e1.length : c1.length + e1.length;
  return (
    head +
    (reachable
      ? `<div class="fl"><svg width="${hop === 1 ? '100%' : Wd}" ${hop === 1 ? `style="min-width:${Wd}px"` : ''} height="${Hd}" viewBox="0 0 ${Wd} ${Hd}" xmlns="http://www.w3.org/2000/svg"><defs>${mk}</defs>${sv}</svg></div>`
      : '<p class="sub">표시 중인 연결 없음(☰에서 등급·범주를 켜 보세요)</p>') +
    (more > 0 || flatAll
      ? `<button class="chip" style="margin-top:6px" data-act="flatall">${flatAll ? '핵심만 보기 (등급순 8개)' : `나머지 ${more}개 더 보기`}</button>`
      : '') +
    `<p class="sub">칸을 누르면 그 노드로 이동 · 선 색 = 등급 · 원 안 기호 = 방향(+ 같이 / − 반대)</p>`
  );
}
