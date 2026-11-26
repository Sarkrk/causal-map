// @ts-check
// 2D 포커스 인과 흐름 맵 (모바일 우선 기본 뷰, 3D는 상단 버튼으로 전환).
// - 상단 컨텍스트 바: 현재 시장 국면 · 오늘 급변 지표(|z|≥1.5 fresh) · 핵심 지표 원탭 진입
// - 중앙 2D 인과 흐름도: 원인(↑/←) · 선택 노드(상태·설명·시뮬/상세 바로가기) · 결과(↓/→)
// - 1단계/2단계 확장, 방향(양쪽/원인/결과), 탐색 이력(breadcrumb), 노드 탭 즉시 이동.
import { GC, SN, SECC, DIR_BTN, levelText, levelColor, TIER_TEXT, FLAG_TEXT } from '../store/labels.js';
import { causalVisible } from '../store/select.js';
import { SIGN_LABEL } from '../engine/graph.js';
import { esc } from '../render/flatmap.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').NodeData} NodeData */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('../store/store.js').AppState} AppState */

/** 빠른 진입용 핵심 시장 지표 후보(데이터에 존재하는 것만 표시) */
export const QUICK_CORE_IDS = [
  '코스피',
  '원/달러',
  '반도체 주가',
  '나스닥',
  '미국 10년물',
  'AI 투자',
  '유가',
  'VIX',
  '소비자물가',
  '한은 금리',
];

/**
 * 오늘 급변한 신선한(fresh) 지표 목록 (|z| 내림차순).
 * @param {Graph} graph
 * @param {number} [minZ=1.4]
 * @param {number} [limit=8]
 * @returns {NodeData[]}
 */
export function pickMovers(graph, minZ = 1.4, limit = 8) {
  return graph.nodes
    .filter((n) => n.state && n.state.fresh && typeof n.state.z === 'number' && Math.abs(n.state.z) >= minZ)
    .sort((a, b) => Math.abs(b.state?.z ?? 0) - Math.abs(a.state?.z ?? 0))
    .slice(0, limit);
}

/**
 * 초기 진입 시 기본 포커스 노드 선택: 급변 지표 중 대표(코스피·반도체·나스닥·유가 우선) 또는 최대 |z|, 없으면 코스피/첫 코어 노드.
 * @param {Graph} graph
 * @returns {string|null}
 */
export function pickInitialNode(graph) {
  const movers = pickMovers(graph, 1.5, 8);
  const prefer = ['코스피', '반도체 주가', '나스닥', '유가', 'VIX', '원/달러'];
  for (const id of prefer) {
    if (movers.some((m) => m.id === id)) return id;
  }
  if (movers.length) return movers[0].id;
  for (const id of QUICK_CORE_IDS) {
    if (graph.byId.has(id)) return id;
  }
  return graph.nodes[0]?.id ?? null;
}

/**
 * 엣지 정렬 기준: 등급(A→D) > B+ 우선 > |r| 내림차순.
 * @param {EdgeData[]} edges
 * @returns {EdgeData[]}
 */
function sortEdges(edges) {
  return edges.slice().sort(
    (x, y) =>
      x.level.localeCompare(y.level) ||
      (y.sub || '').localeCompare(x.sub || '') ||
      Math.abs(y.r || 0) - Math.abs(x.r || 0),
  );
}

/**
 * 2단계(2-hop) 이웃 엣지 묶음 추출(중복 제거, 상위 cap개).
 * @param {EdgeData[]} allVis
 * @param {Set<string>} hop1Ids
 * @param {string} centerId
 * @param {'up'|'down'} dir
 * @param {number} cap
 * @returns {{nodeId:string, viaId:string, edge:EdgeData}[]}
 */
function collectHop2(allVis, hop1Ids, centerId, dir, cap) {
  const seen = new Set([centerId, ...hop1Ids]);
  /** @type {{nodeId:string, viaId:string, edge:EdgeData}[]} */
  const out = [];
  const cands = dir === 'up'
    ? allVis.filter((e) => hop1Ids.has(e.dst) && !seen.has(e.src))
    : allVis.filter((e) => hop1Ids.has(e.src) && !seen.has(e.dst));
  for (const e of sortEdges(cands)) {
    const nid = dir === 'up' ? e.src : e.dst;
    const viaId = dir === 'up' ? e.dst : e.src;
    if (seen.has(nid)) continue;
    seen.add(nid);
    out.push({ nodeId: nid, viaId, edge: e });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * @param {{
 *   root: HTMLElement,
 *   graph: Graph,
 *   store: Store,
 *   meta: Record<string, any>,
 *   onSelectNode: (id: string) => void,
 *   onOpenDetail: (tab: 'in'|'out'|'loop'|'path'|'sim') => void,
 *   onShare: () => void,
 * }} opts
 */
export function initFocus2D(opts) {
  const { root, graph, store, meta, onSelectNode, onOpenDetail, onShare } = opts;

  /** @type {string[]} 최근 탐색 이력(중복 제거 최대 6개) */
  let trail = [];
  let expandedIn = false;
  let expandedOut = false;
  let lastFocused = /** @type {string|null} */ (null);
  let active = true;

  const movers = pickMovers(graph, 1.4, 8);
  const quickCores = QUICK_CORE_IDS.filter((id) => graph.byId.has(id));

  /** @param {string} id */
  function pushTrail(id) {
    if (!id) return;
    if (trail[trail.length - 1] === id) return;
    trail = trail.filter((x) => x !== id);
    trail.push(id);
    if (trail.length > 6) trail.shift();
  }

  /** @param {NodeData} n */
  function statePillHtml(n) {
    const s = n.state;
    if (!s) return '';
    const z = typeof s.z === 'number' ? s.z : 0;
    const tone = z >= 1.5 ? 'up' : z <= -1.5 ? 'down' : 'flat';
    const arrow = z > 0.2 ? '▲' : z < -0.2 ? '▼' : '•';
    const chg = s.chg ? esc(s.chg) : `z ${z > 0 ? '+' : ''}${z.toFixed(1)}`;
    return `<span class="f2-st ${tone}">${arrow} ${chg}</span>`;
  }

  /** @param {EdgeData} e @param {NodeData} other @param {'up'|'down'} dir */
  function edgeCardHtml(e, other, dir) {
    const secCol = SECC[/** @type {'other'} */ (other.sector || 'other')] || '#8a9bb0';
    const lvText = levelText(e.level, e.sub);
    const lvCol = levelColor(e.level, e.sub);
    const signTxt = SIGN_LABEL[e.sign] ?? e.sign;
    const signCls = e.sign === '+' ? 'pos' : e.sign === '-' ? 'neg' : 'mix';
    const rTxt = e.r != null ? `강도 ${Math.abs(e.r).toFixed(2)}` : '';
    const hasFlag = Array.isArray(e.flags) && e.flags.length > 0;
    return (
      `<button type="button" class="f2-ecard ${dir}" data-go="${esc(other.id)}" style="--ec:${secCol}">` +
      `<div class="f2-ectop">` +
      `<span class="f2-sgn ${signCls}" title="인과 방향">${esc(signTxt)}</span>` +
      `<b class="f2-ename">${esc(other.name)}</b>` +
      `<span class="f2-elv" style="background:${GC[e.level]}18;color:${e.level === 'C' ? '#4e5968' : lvCol}">${esc(lvText)}</span>` +
      `</div>` +
      `<div class="f2-ecmeta">` +
      `<span class="f2-esec">${esc(SN[/** @type {'other'} */ (other.sector || 'other')] || '기타')}</span>` +
      (rTxt ? `<span>${esc(rTxt)}</span>` : '') +
      (other.state?.fresh && other.state.chg ? statePillHtml(other) : '') +
      (hasFlag ? `<span class="f2-eflag" title="${esc(e.flags.map((f) => FLAG_TEXT[f] ?? f).join(' · '))}">⚠</span>` : '') +
      `</div>` +
      `</button>`
    );
  }

  /** @param {AppState} st */
  function render(st) {
    if (!active) return;

    let nid = st.view.selected;
    if (!nid || !graph.byId.has(nid)) {
      nid = pickInitialNode(graph);
    }
    if (!nid) {
      root.innerHTML = '<div class="f2-empty">표시할 노드가 없습니다.</div>';
      return;
    }
    if (nid !== lastFocused) {
      expandedIn = false;
      expandedOut = false;
      lastFocused = nid;
      pushTrail(nid);
    }

    const n = /** @type {NodeData} */ (graph.byId.get(nid));
    const sec = n.sector || 'other';
    const secCol = SECC[/** @type {'other'} */ (sec)] || '#8a9bb0';
    const secName = SN[/** @type {'other'} */ (sec)] || '기타';
    const tierName = TIER_TEXT[n.tier || 'core'] || '';

    const allVis = graph.edges.filter((e) => causalVisible(graph, e, st.filters));
    const inE = sortEdges(allVis.filter((e) => e.dst === nid && e.src !== nid));
    const outE = sortEdges(allVis.filter((e) => e.src === nid && e.dst !== nid));
    const hiddenWeak = !st.filters.weak && graph.edges.some(
      (e) => (e.dst === nid || e.src === nid) && e.level === 'B' && e.sub === '-' && st.filters.levels.includes('B'),
    );

    const { hop, dir } = st.view;
    const CAP = 6;
    const shownIn = expandedIn ? inE : inE.slice(0, CAP);
    const shownOut = expandedOut ? outE : outE.slice(0, CAP);

    const hop2In = hop === 2 && dir !== 'down'
      ? collectHop2(allVis, new Set(shownIn.map((e) => e.src)), nid, 'up', 6)
      : [];
    const hop2Out = hop === 2 && dir !== 'up'
      ? collectHop2(allVis, new Set(shownOut.map((e) => e.dst)), nid, 'down', 6)
      : [];

    // ─── 상단 컨텍스트 바: 현재 국면 + 오늘 급변 + 핵심 지표 ───
    const mr = meta?.marketRegime;
    const regimeBadge = mr && mr.label
      ? `<span class="f2-regime ${esc(mr.code || '')}">⚡ ${esc(mr.label)}${mr.asof ? ` <small>${esc(mr.asof.slice(5))}</small>` : ''}</span>`
      : '';

    const moversHtml = movers.length
      ? `<div class="f2-strip-row"><span class="f2-slabel">급변</span><div class="f2-chips">` +
        movers.map((m) => {
          const z = m.state?.z ?? 0;
          const cls = z >= 1.5 ? 'up' : z <= -1.5 ? 'down' : '';
          const onCls = m.id === nid ? ' on' : '';
          return `<button type="button" class="f2-mchip ${cls}${onCls}" data-go="${esc(m.id)}"><b>${esc(m.name)}</b><span>${esc(m.state?.chg || '')}</span></button>`;
        }).join('') +
        `</div></div>`
      : '';

    const coresHtml = quickCores.length
      ? `<div class="f2-strip-row"><span class="f2-slabel">핵심</span><div class="f2-chips">` +
        quickCores.map((id) => {
          const cn = graph.byId.get(id);
          const col = SECC[/** @type {'other'} */ (cn?.sector || 'other')] || '#8a9bb0';
          const onCls = id === nid ? ' on' : '';
          return `<button type="button" class="f2-qchip${onCls}" data-go="${esc(id)}" style="--qc:${col}"><i class="f2-qdot"></i>${esc(id)}</button>`;
        }).join('') +
        `</div></div>`
      : '';

    const trailHtml = trail.length > 1
      ? `<div class="f2-trail">${trail.map((tid, idx) =>
          `<button type="button" class="f2-titem${tid === nid ? ' cur' : ''}" data-go="${esc(tid)}">${esc(tid)}</button>` +
          (idx < trail.length - 1 ? '<i class="f2-tsep">›</i>' : ''),
        ).join('')}</div>`
      : '';

    // ─── 원인 섹션 ───
    let inHtml = '';
    if (dir !== 'down') {
      const h2Html = hop2In.length
        ? `<div class="f2-hop2"><div class="f2-h2lab">2단계 앞선 원인</div><div class="f2-h2chips">` +
          hop2In.map(({ nodeId, viaId, edge }) => {
            const o2 = graph.byId.get(nodeId);
            if (!o2) return '';
            return `<button type="button" class="f2-h2chip" data-go="${esc(nodeId)}"><span class="f2-sgn ${edge.sign === '+' ? 'pos' : edge.sign === '-' ? 'neg' : 'mix'}">${esc(SIGN_LABEL[edge.sign] ?? edge.sign)}</span><b>${esc(o2.name)}</b><small>→ ${esc(viaId)}</small></button>`;
          }).join('') +
          `</div></div>`
        : '';

      const cardsIn = shownIn
        .map((e) => {
          const o = graph.byId.get(e.src);
          return o ? edgeCardHtml(e, o, 'up') : '';
        })
        .join('');
      const moreIn = inE.length > CAP
        ? `<button type="button" class="f2-more" data-act="more-in">${expandedIn ? '접기' : `+ 원인 ${inE.length - CAP}개 더보기`}</button>`
        : '';

      inHtml =
        `<section class="f2-col f2-in">` +
        `<div class="f2-colhd"><span class="f2-badge-up">↑ 원인</span><b>이 지표를 움직이는 요인</b><em>${inE.length}</em></div>` +
        h2Html +
        (inE.length
          ? `<div class="f2-grid">${cardsIn}</div>${moreIn}`
          : `<div class="f2-none">현재 필터에서 표시할 원인이 없어요.</div>`) +
        `</section>` +
        `<div class="f2-conn" aria-hidden="true"><span class="f2-carr">↓</span></div>`;
    }

    // ─── 중앙 포커스 노드 카드 ───
    const descTxt = n.desc && !n.desc.startsWith('엣지 근거') ? `<p class="f2-fdesc">${esc(n.desc)}</p>` : '';
    const stateDetail = n.state
      ? `<div class="f2-fstate">${statePillHtml(n)}<span>최근 ${n.state.win === '21D' ? '21거래일' : esc(n.state.win || '')} · z ${n.state.z > 0 ? '+' : ''}${n.state.z.toFixed(2)} (${esc(n.state.asof || '')})${n.state.fresh ? '' : ' · 기준 경과'}</span></div>`
      : '';

    const centerHtml =
      `<section class="f2-center" style="--fc:${secCol}">` +
      `<div class="f2-ftags">` +
      `<span class="f2-fsec"><i style="background:${secCol}"></i>${esc(secName)}</span>` +
      (tierName ? `<span class="f2-ftier">${esc(tierName)}</span>` : '') +
      `<span class="f2-fstat">원인 ${inE.length} · 결과 ${outE.length}</span>` +
      `</div>` +
      `<h2 class="f2-fname">${esc(n.name)}</h2>` +
      stateDetail +
      descTxt +
      `<div class="f2-fctrl">` +
      `<button type="button" class="f2-cbtn${hop === 2 ? ' on' : ''}" data-act="hop">${hop === 1 ? '1단계' : '2단계'} ⇄</button>` +
      `<button type="button" class="f2-cbtn" data-act="dir">${esc(DIR_BTN[dir])}</button>` +
      `<button type="button" class="f2-cbtn accent" data-act="open-sim">⚡ 충격 시뮬</button>` +
      `<button type="button" class="f2-cbtn" data-act="open-detail">상세·경로·루프</button>` +
      `<button type="button" class="f2-cbtn icon" data-act="share" title="링크 복사" aria-label="링크 복사">🔗</button>` +
      `</div>` +
      (hiddenWeak ? `<button type="button" class="f2-weakbtn" data-act="weak">B- 약한 연결도 함께 보기</button>` : '') +
      `</section>`;

    // ─── 결과 섹션 ───
    let outHtml = '';
    if (dir !== 'up') {
      const cardsOut = shownOut
        .map((e) => {
          const o = graph.byId.get(e.dst);
          return o ? edgeCardHtml(e, o, 'down') : '';
        })
        .join('');
      const moreOut = outE.length > CAP
        ? `<button type="button" class="f2-more" data-act="more-out">${expandedOut ? '접기' : `+ 결과 ${outE.length - CAP}개 더보기`}</button>`
        : '';

      const h2Html = hop2Out.length
        ? `<div class="f2-hop2"><div class="f2-h2lab">2단계 이어지는 파급</div><div class="f2-h2chips">` +
          hop2Out.map(({ nodeId, viaId, edge }) => {
            const o2 = graph.byId.get(nodeId);
            if (!o2) return '';
            return `<button type="button" class="f2-h2chip" data-go="${esc(nodeId)}"><small>${esc(viaId)} →</small><span class="f2-sgn ${edge.sign === '+' ? 'pos' : edge.sign === '-' ? 'neg' : 'mix'}">${esc(SIGN_LABEL[edge.sign] ?? edge.sign)}</span><b>${esc(o2.name)}</b></button>`;
          }).join('') +
          `</div></div>`
        : '';

      outHtml =
        `<div class="f2-conn" aria-hidden="true"><span class="f2-carr">↓</span></div>` +
        `<section class="f2-col f2-out">` +
        `<div class="f2-colhd"><span class="f2-badge-down">↓ 결과</span><b>이 지표가 미치는 영향</b><em>${outE.length}</em></div>` +
        (outE.length
          ? `<div class="f2-grid">${cardsOut}</div>${moreOut}`
          : `<div class="f2-none">현재 필터에서 표시할 결과가 없어요.</div>`) +
        h2Html +
        `</section>`;
    }

    root.innerHTML =
      `<div class="f2-brief">` +
      `<div class="f2-btop">${regimeBadge}<span class="f2-bmeta">노드 ${graph.nodes.length.toLocaleString('ko-KR')} · 연결 ${graph.edges.length.toLocaleString('ko-KR')}</span></div>` +
      moversHtml +
      coresHtml +
      `</div>` +
      trailHtml +
      `<div class="f2-flow ${dir === 'both' ? 'tri' : 'bi'}">` +
      inHtml +
      centerHtml +
      outHtml +
      `</div>`;
  }

  root.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('[data-go],[data-act]') : null);
    if (!el) return;
    const goId = el.getAttribute('data-go');
    if (goId) {
      onSelectNode(goId);
      root.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const act = el.getAttribute('data-act');
    if (act === 'hop') {
      const cur = store.get().view.hop;
      store.dispatch({ type: 'setHop', hop: cur === 1 ? 2 : 1 });
    } else if (act === 'dir') {
      const cur = store.get().view.dir;
      const next = cur === 'both' ? 'up' : cur === 'up' ? 'down' : 'both';
      store.dispatch({ type: 'setDir', dir: next });
    } else if (act === 'more-in') {
      expandedIn = !expandedIn;
      render(store.get());
    } else if (act === 'more-out') {
      expandedOut = !expandedOut;
      render(store.get());
    } else if (act === 'weak') {
      store.dispatch({ type: 'toggle', key: 'weak' });
    } else if (act === 'open-sim') {
      ensureSelected();
      onOpenDetail('sim');
    } else if (act === 'open-detail') {
      ensureSelected();
      onOpenDetail('in');
    } else if (act === 'share') {
      ensureSelected();
      onShare();
    }
  });

  function ensureSelected() {
    if (!store.get().view.selected && lastFocused) {
      onSelectNode(lastFocused);
    }
  }

  store.subscribe((st) => render(st));

  return {
    setActive(/** @type {boolean} */ on) {
      active = on;
      root.hidden = !on;
      if (on) render(store.get());
    },
    renderNow() {
      render(store.get());
    },
  };
}
