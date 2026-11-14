// @ts-check
// 노드 상세 시트: 헤더·탭·항목 목록·관계도. 원본 render()·item()·cri()와 같은 문구.
// 클릭은 이벤트 위임(data-act/data-id). inline onclick은 쓰지 않는다.
// 루프·경로 탭: 계산·HTML은 explore.js. 경로 입력창은 재렌더 때 유지하고 제안·결과만 갈아 끼운다.
import { GC, CC, CN, DIR_BTN, levelText, levelColor } from '../store/labels.js';
import { causalVisible } from '../store/select.js';
import { SIGN_LABEL } from '../engine/graph.js';
import { esc, flatHtml } from '../render/flatmap.js';
import {
  loopItems,
  loopTabHtml,
  pathBoxHtml,
  pathListHtml,
  suggestHtml,
  traceAt,
  sameTrace,
} from './explore.js';
import { simTabHtml, simTraceAt } from './simulate.js';

/** @typedef {import('../store/store.js').AppState} AppState */
/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').CorData} CorData */
/** @typedef {import('../types.js').NodeData} NodeData */

/**
 * 노드 설명 블록 HTML(desc만, 출처 등 내부 정보는 싣지 않는다). 이스케이프. 해당 필드가 없으면 ''.
 * @param {NodeData} n
 * @returns {string}
 */
export function nodeDescHtml(n) {
  let h = '';
  // 빌드 과정의 근거 메모가 설명 자리에 들어간 경우('엣지 근거: …')는 사용자에게 보이지 않는다.
  if (n.desc && !n.desc.startsWith('엣지 근거')) h += `<div class="ndesc-t">${esc(n.desc)}</div>`;
  // 다른 이름(aka)은 데이터에만 두고 화면에는 표시하지 않는다(11/14 지시: 우선 내부 관리).
  return h;
}

/**
 * @param {{graph: Graph, store: Store, nt: HTMLElement, nsub: HTMLElement, nb: HTMLElement}} o
 * @returns {void}
 */
export function initPanel(o) {
  const { graph, store, nt, nsub, nb } = o;

  // 탭 줄(#nhead)과 본문(#nbody)을 따로 갈아 끼워서, 경로 입력창이 있는 본문은 탭을 바꿔도 같은 DOM을 유지한다.
  const ndesc = document.createElement('div');
  ndesc.id = 'ndesc';
  nsub.insertAdjacentElement('afterend', ndesc);

  nb.innerHTML = '<div id="nhead"></div><div id="nbody"></div>';
  const nhead = /** @type {HTMLElement} */ (nb.querySelector('#nhead'));
  const nbody = /** @type {HTMLElement} */ (nb.querySelector('#nbody'));

  /** @param {string} id @returns {NodeData} */
  const nodeOf = (id) => {
    const x = graph.byId.get(id);
    if (!x) throw new Error('unknown node ' + id);
    return x;
  };

  /** @param {EdgeData[]} a */
  const ord = (a) =>
    a
      .slice()
      .sort(
        (x, y) =>
          x.level.localeCompare(y.level) ||
          (y.sub || '').localeCompare(x.sub || '') ||
          Math.abs(y.r || 0) - Math.abs(x.r || 0),
      );

  const TOP_N = 5;
  /** 펼친 목록(노드·탭 단위). */
  const opened = new Set();

  /**
   * @param {AppState} st
   * @param {EdgeData} l
   * @param {NodeData} other
   * @param {string} dir
   */
  const item = (st, l, other, dir) =>
    `<div class="it"><div class="r1"><span class="g" style="background:${GC[l.level]}33;color:${l.level === 'C' ? '#bbb' : levelColor(l.level, l.sub)}">${esc(levelText(l.level, l.sub))}</span>` +
    `<span class="sg">${esc(SIGN_LABEL[l.sign] ?? l.sign)}</span><span class="nm">${dir} ${esc(other.name)}</span>` +
    `<a class="go" data-act="go" data-id="${esc(other.id)}" role="button">이동 ›</a></div>` +
    (l.r != null ? `<div class="meta">강도 ${+Math.abs(l.r).toFixed(2)}</div>` : '') +
    (l.note ? `<div class="note">${esc(l.note)}</div>` : '') +
    `</div>`;

  /**
   * 상위 TOP_N개만 먼저 보이고 나머지는 접는다.
   * @param {string} key  펼침 상태 키
   * @param {string[]} rows
   */
  const fold = (key, rows) => {
    if (rows.length === 0) return '<p class="sub">표시할 연결이 없습니다.</p>';
    if (rows.length <= TOP_N || opened.has(key)) return rows.join('');
    return rows.slice(0, TOP_N).join('') + `<button class="chip more" data-act="more" data-key="${esc(key)}">나머지 ${rows.length - TOP_N}개 보기</button>`;
  };

  /** @param {CorData} l @param {string} selId */
  const cri = (l, selId) => {
    const o2 = nodeOf(l.src === selId ? l.dst : l.src);
    return (
      `<div class="it"><div class="r1"><span class="g" style="background:#3fb6c933;color:#3fb6c9">상관</span>` +
      `<span class="nm">${esc(o2.name)}</span><a class="go" data-act="go" data-id="${esc(o2.id)}" role="button">이동 ›</a></div>` +
      `<div class="meta">강도 ${+Math.abs(l.r).toFixed(2)}</div></div>`
    );
  };

  /** @param {AppState} st */
  function render(st) {
    const sel = st.view.selected;
    if (!sel) return;
    const n = nodeOf(sel);
    const { hop, dir, tab } = st.view;
    const shown = (/** @type {EdgeData} */ l) => causalVisible(graph, l, st.filters);
    const inn = graph.edges.filter((l) => l.dst === n.id && shown(l));
    const out = graph.edges.filter((l) => l.src === n.id && shown(l));
    // 보기 설정에서 꺼 둔 약한(B-) 연결이 있으면 켤 수 있는 버튼을 목록 끝에 둔다.
    const hiddenWeak = !st.filters.weak && graph.edges.some((l) => (l.dst === n.id || l.src === n.id) && l.level === 'B' && l.sub === '-' && st.filters.levels.includes('B'));
    const weakBtn = hiddenWeak ? '<button class="chip more" data-act="weak">B- 약한 연결도 보기</button>' : '';
    const cr = graph.cors.filter((c) => c.src === n.id || c.dst === n.id);

    nt.innerHTML = `<span class="dot" style="background:${CC[n.cat]}"></span>${esc(n.name)}`;
    nsub.textContent = CN[n.cat];

    ndesc.innerHTML = nodeDescHtml(n);

    /** @type {Record<'map'|'in'|'out'|'cor', string>} */
    const B = {
      map: flatHtml(graph, st, n.id),
      in: fold(sel + '|in', ord(inn).map((l) => item(st, l, nodeOf(l.src), '←'))) + weakBtn,
      out: fold(sel + '|out', ord(out).map((l) => item(st, l, nodeOf(l.dst), '→'))) + weakBtn,
      cor: fold(sel + '|cor', cr.map((c) => cri(c, n.id))),
    };
    const tabDefs = [
      ['map', '관계도', ''],
      ['in', '← 원인', ' ' + inn.length],
      ['out', '결과 →', ' ' + out.length],
      ['cor', '상관', ' ' + cr.length],
      ['loop', '루프', ' ' + loopItems(graph, st).length],
      ['path', '경로', ''],
      ['sim', '시뮬', ''],
    ];
    const tabs = tabDefs.filter(([k]) => k !== 'cor' || cr.length > 0 || tab === 'cor').map(
      ([k, label, cnt]) => `<button class="${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${label}${cnt}</button>`,
    );
    nhead.innerHTML =
      `<div class="tabs">${tabs.join('')}</div>` +
      (tab === 'map'
        ? `<div class="tabs" style="margin-top:0;justify-content:flex-end"><button data-act="hop">${hop}단계 ⇄</button><button data-act="dir">${DIR_BTN[dir]}</button></div>`
        : '');

    if (tab === 'loop') {
      nbody.innerHTML = loopTabHtml(graph, st);
    } else if (tab === 'sim') {
      nbody.innerHTML = simTabHtml(graph, st);
    } else if (tab === 'path') {
      const box = nbody.querySelector('#pbox');
      if (box && box.getAttribute('data-sel') === sel) {
        // 입력창(#pq)과 입력값은 그대로 두고 제안·결과만 갈아 끼운다.
        const pl = box.querySelector('[data-part="plist"]');
        if (pl) pl.innerHTML = pathListHtml(graph, st);
        const ps = box.querySelector('#psug');
        if (ps) ps.innerHTML = suggestHtml(graph, st.view.pathQuery, sel);
      } else {
        nbody.innerHTML = pathBoxHtml(graph, st);
      }
    } else {
      nbody.innerHTML = B[/** @type {'map'|'in'|'out'|'cor'} */ (tab)] || `<p class="sub">없음</p>${tab === 'in' || tab === 'out' ? weakBtn : ''}`;
    }
    const fl = nbody.querySelector('.fl');
    if (fl && fl.scrollWidth > fl.clientWidth) fl.scrollLeft = (fl.scrollWidth - fl.clientWidth) / 2;
  }

  nb.addEventListener('click', (e) => {
    const t = /** @type {Element} */ (e.target);
    const a = t.closest('[data-act]');
    if (a) {
      const act = a.getAttribute('data-act');
      const st = store.get();
      if (act === 'go') {
        const id = a.getAttribute('data-id');
        if (id) store.dispatch({ type: 'select', id });
      } else if (act === 'tab') {
        const tab = /** @type {'map'|'in'|'out'|'cor'|'loop'|'path'|'sim'} */ (a.getAttribute('data-tab'));
        store.dispatch({ type: 'setTab', tab });
      } else if (act === 'hop') {
        store.dispatch({ type: 'setHop', hop: st.view.hop === 1 ? 2 : 1 });
      } else if (act === 'dir') {
        const next = st.view.dir === 'both' ? 'up' : st.view.dir === 'up' ? 'down' : 'both';
        store.dispatch({ type: 'setDir', dir: next });
      } else if (act === 'weak') {
        store.dispatch({ type: 'toggle', key: 'weak' });
      } else if (act === 'more') {
        opened.add(a.getAttribute('data-key'));
        render(st);
      } else if (act === 'flatall') {
        store.dispatch({ type: 'toggleFlatAll' });
      } else if (act === 'trace') {
        // 같은 항목을 다시 누르면 강조 해제
        const tr = traceAt(graph, st, a.getAttribute('data-kind'), Number(a.getAttribute('data-idx')));
        if (!tr) return;
        if (sameTrace(st.view.trace, tr)) store.dispatch({ type: 'clearTrace' });
        else store.dispatch({ type: 'setTrace', trace: tr });
      } else if (act === 'simsign') {
        store.dispatch({ type: 'setSim', patch: { sign: Number(a.getAttribute('data-v')) } });
      } else if (act === 'simrun') {
        store.dispatch({ type: 'runSim' });
      } else if (act === 'simtrace') {
        const tr = simTraceAt(graph, st, a.getAttribute('data-kind'), Number(a.getAttribute('data-idx')));
        if (!tr) return;
        if (sameTrace(st.view.trace, tr)) store.dispatch({ type: 'clearTrace' });
        else store.dispatch({ type: 'setTrace', trace: tr });
      } else if (act === 'pathto') {
        const id = a.getAttribute('data-id');
        const pq = /** @type {HTMLInputElement|null} */ (nb.querySelector('#pq'));
        if (pq) pq.value = '';
        store.dispatch({ type: 'setPathQuery', value: '' });
        if (id) store.dispatch({ type: 'setPathTo', id });
      } else if (act === 'pathrev') {
        store.dispatch({ type: 'togglePathRev' });
      }
      return;
    }
    const it = t.closest('.it');
    if (it) it.classList.toggle('x');
  });

  // 시뮬 입력(국면·깊이): 바꾸면 이전 결과는 무효가 된다
  nb.addEventListener('change', (e) => {
    const t = /** @type {HTMLSelectElement} */ (e.target);
    if (t.id === 'simreg') store.dispatch({ type: 'setSim', patch: { regime: t.value === '' ? null : t.value } });
    else if (t.id === 'simdepth') store.dispatch({ type: 'setSim', patch: { depth: Number(t.value) } });
  });

  // 경로 입력: 제안 목록만 갱신(입력창은 건드리지 않는다)
  nb.addEventListener('input', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.id !== 'pq') return;
    // 검색어는 store에 두어 탭을 오가도 유지한다. 제안 목록은 render가 갈아 끼운다.
    store.dispatch({ type: 'setPathQuery', value: /** @type {HTMLInputElement} */ (t).value });
  });

  // 상단 검색어는 패널 내용과 무관하므로 다시 그리지 않는다.
  store.subscribe((st, _prev, action) => {
    if (action.type !== 'setSearch') render(st);
  });
  render(store.get());
}
