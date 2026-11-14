// @ts-check
// 필터 칩(등급·범주), |r| 슬라이더, 표시 토글. 원본 chip()·tg()·thrEl 동작.
// 화면 상태는 store를 따라간다(subscribe에서 칩 on/off 동기화).
import { LEVELS, CC, GC, CN } from '../store/labels.js';

/** @typedef {import('../store/store.js').AppState} AppState */
/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('../types.js').Graph} Graph */

/**
 * @param {{
 *   graph: Graph, store: Store, categories: string[],
 *   flv: HTMLElement, fcat: HTMLElement, thrEl: HTMLInputElement, thrv: HTMLElement,
 *   toggles: {tnr: HTMLElement, tcor: HTMLElement, tlab: HTMLElement, torp: HTMLElement, tspin: HTMLElement, twob: HTMLElement}
 * }} o
 * @returns {void}
 */
export function initFilters(o) {
  const { graph, store, categories, flv, fcat, thrEl, thrv, toggles } = o;

  /** @type {Map<HTMLElement, (st: AppState) => boolean>} */
  const chips = new Map();

  /**
   * @param {HTMLElement} par
   * @param {string} txt
   * @param {string|undefined} col
   * @param {(st: AppState) => boolean} isOn
   * @param {() => void} act
   * @returns {HTMLButtonElement}
   */
  function chip(par, txt, col, isOn, act) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = txt;
    if (col) b.style.setProperty('--stripe', col);
    b.addEventListener('click', act);
    par.appendChild(b);
    chips.set(b, isOn);
    return b;
  }

  /** @type {Record<string, number>} */
  const cnt = {};
  /** @type {Record<string, number>} */
  const cntSub = {};
  graph.edges.forEach((e) => {
    cnt[e.level] = (cnt[e.level] || 0) + 1;
    if (e.level === 'B' && e.sub) cntSub[e.sub] = (cntSub[e.sub] || 0) + 1;
  });

  for (const v of LEVELS) {
    // B 칩은 B+·B-를 모두 포함한다(필터는 A~D 4개 유지). 칩에는 합계만, 세분은 툴팁에.
    const sub = v === 'B' && cntSub['+'] + cntSub['-'] > 0 ? ` (B+ ${cntSub['+'] || 0} · B- ${cntSub['-'] || 0})` : '';
    const b = chip(
      flv,
      `${v} ${cnt[v] || 0}`,
      GC[/** @type {'A'} */ (v)],
      (st) => st.filters.levels.includes(v),
      () => store.dispatch({ type: 'toggleLevel', level: v }),
    );
    if (sub) b.title = `B${sub}`;
  }
  for (const k of categories) {
    chip(
      fcat,
      CN[/** @type {'Other'} */ (k)],
      CC[/** @type {'Other'} */ (k)],
      (st) => st.filters.cats.includes(k),
      () => store.dispatch({ type: 'toggleCat', cat: k }),
    );
  }

  const paintThr = () => thrEl.style.setProperty('--p', ((+thrEl.value - +(thrEl.min || 0)) / ((+thrEl.max || 1) - +(thrEl.min || 0))) * 100 + '%');
  thrEl.addEventListener('input', paintThr);
  thrEl.addEventListener('input', () => store.dispatch({ type: 'setThr', value: +thrEl.value }));

  /** @type {[HTMLElement, 'showNR'|'showCor'|'labAll'|'hideOrph'|'autoSpin'|'wobble', (st: AppState) => boolean][]} */
  const tg = [
    [toggles.tnr, 'showNR', (st) => st.filters.showNR],
    [toggles.tcor, 'showCor', (st) => st.filters.showCor],
    [toggles.tlab, 'labAll', (st) => st.prefs.labAll],
    [toggles.torp, 'hideOrph', (st) => st.prefs.hideOrph],
    [toggles.tspin, 'autoSpin', (st) => st.prefs.autoSpin],
    [toggles.twob, 'wobble', (st) => st.prefs.wobble],
  ];
  for (const [el, key] of tg) {
    el.addEventListener('click', () => store.dispatch({ type: 'toggle', key }));
  }

  /** @param {AppState} st */
  function sync(st) {
    for (const [b, isOn] of chips) b.classList.toggle('on', isOn(st));
    thrEl.value = String(st.filters.thr);
    thrv.textContent = st.filters.thr.toFixed(2);
    paintThr();
    for (const [el, , get] of tg) el.classList.toggle('on', get(st));
  }

  sync(store.get());
  store.subscribe((st) => sync(st));
}
