// @ts-check
// 노드 패널의 '시뮬' 탭: 입력 폼·결과 HTML·클릭 해석. DOM 접근 없음(문자열과 순수 함수만).
// 결과는 store에 저장하지 않고 (graph, 필터, 입력)이 같으면 메모이즈된 값을 쓴다.
import { simulate } from '../engine/simulate.js';
import { SIGN_LABEL } from '../engine/graph.js';
import { REGIMES } from '../schema/v2.js';
import { causalVisible } from '../store/select.js';
import { SIM_DEPTH_MIN, SIM_DEPTH_MAX } from '../store/store.js';
import { esc } from '../render/flatmap.js';
import { traceOf } from './explore.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').SimResult} SimResult */
/** @typedef {import('../types.js').SimImpact} SimImpact */
/** @typedef {import('../types.js').ScoredPath} ScoredPath */
/** @typedef {import('../types.js').SimWarning} SimWarning */
/** @typedef {import('../store/store.js').AppState} AppState */
/** @typedef {import('../store/store.js').Trace} Trace */

export const REGIME_LABEL = /** @type {Record<string,string>} */ ({
  normal: '평시',
  stress: '위기·꼬리위험',
  tightening: '긴축',
  easing: '완화',
  recession: '침체',
  expansion: '확장',
});

export const SCORE_NOTE = '경로 수·근거 등급을 합친 상대 크기, 확률 아님';

/** 경고 종류 → 라벨·색 */
export const WARN_LABEL = {
  'loop-R': { text: '강화 루프', color: '#f7768e' },
  'loop-B': { text: '균형 루프', color: '#7aa2f7' },
  confounder: { text: '공통원인 가능', color: '#e0af68' },
  'correlation-only': { text: '상관만 있음(인과 아님)', color: '#3fb6c9' },
};

const DIR_COLOR = { '+': '#9ece6a', '-': '#f7768e', '±': '#9a9a9a' };
const DIR_ARROW = { '+': '↑', '-': '↓', '±': '±' };

/** @type {WeakMap<Graph, Map<string, SimResult>>} */
const memo = new WeakMap();
const MAX_ENTRIES = 20;

/**
 * 실행된 시뮬레이션 결과. 선택 노드에서 실행하지 않았으면 null.
 * @param {Graph} g
 * @param {AppState} st
 * @returns {SimResult|null}
 */
export function simResult(g, st) {
  const { selected, sim } = st.view;
  if (!selected || sim.start !== selected || !g.byId.has(selected)) return null;
  const key = JSON.stringify([st.filters, sim]);
  let m = memo.get(g);
  if (!m) {
    m = new Map();
    memo.set(g, m);
  }
  const hit = m.get(key);
  if (hit) return hit;
  const r = simulate(g, selected, sim.sign, {
    activeRegime: sim.regime,
    maxDepth: sim.depth,
    edgeFilter: (e) => causalVisible(g, e, st.filters),
  });
  m.set(key, r);
  if (m.size > MAX_ENTRIES) m.delete(/** @type {string} */ (m.keys().next().value));
  return r;
}

/** @param {number} n */
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * 영향 노드의 시차 문구. lag 미상 엣지가 낀 경로는 '시차 미상'.
 * @param {SimImpact} imp
 * @param {ScoredPath[]} paths 결과의 대표 경로 전체
 * @returns {string}
 */
function lagText(imp, paths) {
  const mine = paths.filter((p) => p.nodes[p.nodes.length - 1] === imp.id);
  const p = mine.find((x) => x.lagMonths === imp.minLagMonths) ?? mine[0];
  const known = imp.minLagMonths > 0 ? `확인된 구간 ${imp.minLagMonths}개월` : '';
  if (!p || p.unknownLags > 0) return known ? `시차 미상 (${known})` : '시차 미상';
  return imp.minLagMonths === 0 ? '즉시~1개월 미만' : `약 ${imp.minLagMonths}개월`;
}

/**
 * 노드열 → 'A → B → C'
 * @param {Graph} g
 * @param {string[]} ids
 */
function chain(g, ids) {
  return ids.map((id) => esc(g.byId.get(id)?.name ?? id)).join(' → ');
}

/**
 * 경고 → Trace(노드열, 엣지 id가 있으면 함께).
 * @param {SimWarning} w
 * @returns {Trace}
 */
function warnTrace(w) {
  return { kind: 'path', nodes: w.nodes.slice(), edges: (w.edges ?? []).slice() };
}

/**
 * 결과 HTML(순수). 클릭 요소는 data-act="simtrace" data-kind="path|warn" data-idx.
 * @param {SimResult} r
 * @param {Graph} g
 * @param {Trace|null} [active] 현재 강조 중인 trace(선택 표시용)
 * @returns {string}
 */
export function simHtml(r, g, active = null) {
  const nm = (/** @type {string} */ id) => esc(g.byId.get(id)?.name ?? id);
  const same = (/** @type {Trace} */ t) =>
    !!active &&
    active.kind === t.kind &&
    active.edges.join('\u0001') === t.edges.join('\u0001') &&
    active.nodes.join('\u0001') === t.nodes.join('\u0001');
  const onStyle = (/** @type {boolean} */ on) => `cursor:pointer;${on ? 'background:#2e2e2e;border-radius:8px;' : ''}`;
  const dirText = r.shockSign === 1 ? '상승(+)' : '하락(−)';
  let h = `<div class="sub" style="margin-top:10px;line-height:1.5">${nm(r.start)} ${dirText} 충격 · 국면: ${esc(r.regime ? (REGIME_LABEL[r.regime] ?? r.regime) : '평시 가정')}</div>`;
  if (r.truncated) h += '<p class="sub" style="color:#e0af68">경로가 많아 일부만 계산했습니다.</p>';
  if (r.impacts.length === 0) return h + '<p class="sub">전파되는 노드가 없습니다(현재 필터·국면 기준).</p>';

  h += `<div class="sec" style="margin-top:12px">영향 노드 <span class="sub" title="${esc(SCORE_NOTE)}">· 상대 점수 ⓘ</span></div>`;
  h += `<div class="sub" style="line-height:1.5">상대 점수: ${esc(SCORE_NOTE)}.</div>`;
  for (const imp of r.impacts) {
    const col = DIR_COLOR[imp.sign] ?? DIR_COLOR['±'];
    h +=
      `<div class="it"><div class="r1"><span class="g" style="background:${col}33;color:${col}">${esc(DIR_ARROW[imp.sign] ?? '±')}</span>` +
      `<span class="nm">${nm(imp.id)}</span></div>` +
      `<div class="meta" title="${esc(SCORE_NOTE)}">상대 점수 ${esc(fmt(Math.abs(imp.score)))} · ${esc(lagText(imp, r.paths))} · 깊이 ${imp.depth}</div></div>`;
  }

  if (r.paths.length) {
    h += '<div class="sec" style="margin-top:12px">핵심 전달 경로 <span class="sub">(누르면 지도에 강조)</span></div>';
    r.paths.forEach((p, i) => {
      const on = same(traceOf('path', p));
      const col = DIR_COLOR[p.sign] ?? DIR_COLOR['±'];
      h +=
        `<div class="it${on ? ' on' : ''}" data-act="simtrace" data-kind="path" data-idx="${i}" style="${onStyle(on)}">` +
        `<div class="r1" style="flex-wrap:wrap"><span class="g" style="background:${col}33;color:${col}">순효과 ${esc(SIGN_LABEL[p.sign] ?? p.sign)}</span>` +
        `<span class="nm" style="font-size:14px;line-height:1.5">${chain(g, p.nodes)}</span></div>` +
        `<div class="meta">경로 신뢰도 ${esc(fmt(p.confidence))} · 가장 약한 등급 ${esc(p.minLevel)} · 길이 ${p.edges.length}</div></div>`;
    });
  }

  if (r.warnings.length) {
    h += '<div class="sec" style="margin-top:12px">주의 <span class="sub">(누르면 지도에 강조)</span></div>';
    r.warnings.forEach((w, i) => {
      const l = WARN_LABEL[w.kind] ?? { text: w.kind, color: '#9a9a9a' };
      const on = same(warnTrace(w));
      h +=
        `<div class="it${on ? ' on' : ''}" data-act="simtrace" data-kind="warn" data-idx="${i}" style="${onStyle(on)}">` +
        `<div class="r1" style="flex-wrap:wrap"><span class="g" style="background:${l.color}33;color:${l.color}">${esc(l.text)}</span>` +
        `<span class="nm" style="font-size:14px;line-height:1.5">${esc(w.message)}</span></div></div>`;
    });
  }
  return h;
}

/**
 * 결과 항목 클릭(data-kind, data-idx) → Trace.
 * @param {Graph} g
 * @param {AppState} st
 * @param {string|null} kind
 * @param {number} idx
 * @returns {Trace|null}
 */
export function simTraceAt(g, st, kind, idx) {
  if (!Number.isInteger(idx) || idx < 0) return null;
  const r = simResult(g, st);
  if (!r) return null;
  if (kind === 'path') {
    const p = r.paths[idx];
    return p ? traceOf('path', p) : null;
  }
  if (kind === 'warn') {
    const w = r.warnings[idx];
    return w ? warnTrace(w) : null;
  }
  return null;
}

/**
 * 입력 폼 + 결과(시뮬 탭 본문).
 * @param {Graph} g
 * @param {AppState} st
 * @returns {string}
 */
export function simTabHtml(g, st) {
  const { sim, trace } = st.view;
  const chip = (/** @type {boolean} */ on, /** @type {string} */ attrs, /** @type {string} */ label) =>
    `<button class="chip${on ? ' on' : ''}" ${attrs}>${label}</button>`;
  /** @type {(string|null)[]} */
  const regimes = [null, ...REGIMES];
  const regOpts = regimes
    .map((k) => {
      const label = k === null ? '평시 가정(국면 미지정)' : (REGIME_LABEL[k] ?? k);
      return `<option value="${esc(k ?? '')}"${sim.regime === k ? ' selected' : ''}>${esc(label)}</option>`;
    })
    .join('');
  let depthOpts = '';
  for (let d = SIM_DEPTH_MIN; d <= SIM_DEPTH_MAX; d++) depthOpts += `<option value="${d}"${sim.depth === d ? ' selected' : ''}>${d}단계</option>`;
  const selStyle = 'height:34px;border-radius:16px;border:1px solid var(--line);background:#2e2e2e;color:var(--tx);padding:0 10px;font-size:14px';
  const form =
    `<p class="sub" style="margin-top:6px;line-height:1.5">이 노드가 오르거나 내릴 때 인과 연결을 따라 어디가 어느 방향으로 움직일지 추정합니다. 예측이 아니라 근거 등급을 반영한 방향 추정입니다.</p>` +
    `<div class="row" style="margin-top:8px">${chip(sim.sign === 1, 'data-act="simsign" data-v="1"', '↑ 상승 충격')}${chip(sim.sign === -1, 'data-act="simsign" data-v="-1"', '↓ 하락 충격')}</div>` +
    `<div class="row" style="margin-top:8px;align-items:center"><label class="sub">국면 <select id="simreg" style="${selStyle}">${regOpts}</select></label>` +
    `<label class="sub">깊이 <select id="simdepth" style="${selStyle}">${depthOpts}</select></label></div>` +
    `<div class="row" style="margin-top:8px"><button class="chip on" data-act="simrun">충격 시뮬레이션 실행</button></div>`;
  const r = simResult(g, st);
  return form + (r ? simHtml(r, g, trace) : '<p class="sub" style="margin-top:10px">입력을 고르고 실행을 누르세요.</p>');
}
