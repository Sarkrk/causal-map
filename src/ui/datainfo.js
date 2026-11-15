// @ts-check
// 보기 설정 시트의 '데이터 정보' 블록: 노드·관계선 개수, 등급 분포 막대, 출처·갱신 정보.
// 값은 전부 graph.json(meta·nodes·edges)에서 계산한다. 지어낸 수치를 쓰지 않는다.
import { GC, LEVELS, LEVEL_TEXT } from '../store/labels.js';

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */

/** 정수 천 단위 구분. */
const nf = new Intl.NumberFormat('ko-KR');

/**
 * 등급별 관계선 개수. B는 sub('+'|'-')가 있으면 B+/B- 소계도 함께 센다.
 * @param {EdgeData[]} edges
 * @returns {{total: number, byLevel: Record<string, number>, bplus: number, bminus: number}}
 */
export function countLevels(edges) {
  /** @type {Record<string, number>} */
  const byLevel = { A: 0, B: 0, C: 0, D: 0 };
  let bplus = 0;
  let bminus = 0;
  for (const e of edges) {
    byLevel[e.level] = (byLevel[e.level] || 0) + 1;
    if (e.level === 'B') {
      if (e.sub === '+') bplus += 1;
      else if (e.sub === '-') bminus += 1;
    }
  }
  return { total: edges.length, byLevel, bplus, bminus };
}

/**
 * 연결이 하나도 없는 노드 수(화면에서 '연결 없는 점 숨김'이 켜져 있으면 실제로 안 보인다).
 * @param {Graph} graph
 * @returns {number}
 */
export function isolatedCount(graph) {
  let n = 0;
  for (const node of graph.nodes) if ((graph.deg.get(node.id) ?? 0) === 0) n += 1;
  return n;
}

/**
 * 데이터 정보 HTML. meta가 없어도 graph에서 셀 수 있는 값은 모두 채운다.
 * @param {{graph: Graph, meta: {version?: string, generated?: string, nodes?: number, edges?: number}}} o
 * @returns {string}
 */
export function dataInfoHtml(o) {
  const { graph, meta } = o;
  const nodes = graph.nodes.length;
  const edges = graph.edges.length;
  const { byLevel, bplus, bminus } = countLevels(graph.edges);
  const iso = isolatedCount(graph);
  const cat = new Set(graph.nodes.map((n) => n.cat)).size;

  /** @param {string} k @param {string} v @param {string} [title] */
  const row = (k, v, title) =>
    `<div class="frow"${title ? ` title="${title}"` : ''}><span class="k">${k}</span><span class="v">${v}</span></div>`;

  // 등급 막대(비율). 관계선이 0이면 막대를 그리지 않는다(0으로 나누지 않는다).
  let bar = '';
  if (edges > 0) {
    bar =
      '<div class="fbar">' +
      LEVELS.map((lv) => {
        const n = byLevel[lv] || 0;
        if (!n) return '';
        const pct = (n / edges) * 100;
        return `<i style="width:${pct.toFixed(3)}%;background:${GC[/** @type {'A'} */ (lv)]}" title="${LEVEL_TEXT[/** @type {'A'} */ (lv)]} ${nf.format(n)}건 ${pct.toFixed(1)}%"></i>`;
      }).join('') +
      '</div>';
  }

  const lvRows = LEVELS.map((lv) => {
    const n = byLevel[lv] || 0;
    const pct = edges ? ((n / edges) * 100).toFixed(1) : '0.0';
    return row(`${LEVEL_TEXT[/** @type {'A'} */ (lv)]}`, `${nf.format(n)}건 <b>${pct}%</b>`);
  }).join('');

  const bSplit =
    byLevel.B > 0 && (bplus > 0 || bminus > 0)
      ? row('B 세분', `B+ ${nf.format(bplus)} · B− ${nf.format(bminus)}`, 'B+ = 구조 근거에 시장 데이터가 부분 이상 받침, B− = 구조 근거만')
      : '';

  const gen = meta.generated ? String(meta.generated) : '';
  const ver = meta.version ? String(meta.version) : '';

  return (
    row('노드', `${nf.format(nodes)}개`) +
    row('관계선', `${nf.format(edges)}개`) +
    row('범주', `${nf.format(cat)}종`) +
    row('무연결 노드', `${nf.format(iso)}개`, '연결이 하나도 없는 노드. 보기 설정의 "연결 없는 점 숨김"이 켜져 있으면 화면에 보이지 않는다.') +
    bar +
    `<div class="fnote">관계선 등급 분포</div>` +
    lvRows +
    bSplit +
    (gen ? row('데이터 갱신', gen) : '') +
    (ver ? row('버전', ver) : '')
  );
}

/**
 * #fstat 요소를 채운다. 요소가 없으면 조용히 넘어간다(구버전 index.html 호환).
 * @param {HTMLElement|null} el
 * @param {{graph: Graph, meta: {version?: string, generated?: string}}} o
 * @returns {void}
 */
export function initDataInfo(el, o) {
  if (!el) return;
  el.innerHTML = dataInfoHtml(o);
}
