// @ts-check
// 필터 칩(등급·범주), |r| 슬라이더, 표시 토글. 원본 chip()·tg()·thrEl 동작.
// 화면 상태는 store를 따라간다(subscribe에서 칩 on/off 동기화).
import { LEVELS, LEVEL_TEXT, CC, GC, CN } from '../store/labels.js';
import { defaultState } from '../store/store.js';

/** @typedef {import('../store/store.js').AppState} AppState */
/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('../types.js').Graph} Graph */

/**
 * @param {{
 *   graph: Graph, store: Store, categories: string[],
 *   flv: HTMLElement, fcat: HTMLElement, thrEl: HTMLInputElement, thrv: HTMLElement,
 *   reset: HTMLElement, badge: HTMLElement,
 *   toggles: {tweak: HTMLElement, tnr: HTMLElement, tcor: HTMLElement, tlab: HTMLElement, torp: HTMLElement, tspin: HTMLElement, twob: HTMLElement}
 * }} o
 * @returns {void}
 */
export function initFilters(o) {
  const { graph, store, categories, flv, fcat, thrEl, thrv, toggles, reset, badge } = o;
  const base = defaultState(categories);

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

  for (const v of LEVELS) {
    chip(
      flv,
      LEVEL_TEXT[/** @type {'A'} */ (v)],
      GC[/** @type {'A'} */ (v)],
      (st) => st.filters.levels.includes(v),
      () => store.dispatch({ type: 'toggleLevel', level: v }),
    );
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

  /** @type {[HTMLElement, 'showNR'|'showCor'|'weak'|'labAll'|'hideOrph'|'autoSpin'|'wobble', (st: AppState) => boolean][]} */
  const tg = [
    [toggles.tweak, 'weak', (st) => st.filters.weak],
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

  // 시트 헤더 드래그(pointerdown·capture)와 겹치지 않게 막는다.
  reset.addEventListener('pointerdown', (e) => e.stopPropagation());
  reset.addEventListener('click', () => store.dispatch({ type: 'resetFilters', filters: base.filters }));

  /** 기본값과 다른 필터 개수(☰ 배지·초기화 표시). */
  const activeCount = (/** @type {AppState} */ st) => {
    const f = st.filters;
    const b = base.filters;
    return (
      f.levels.filter((x) => !b.levels.includes(x)).length +
      b.levels.filter((x) => !f.levels.includes(x)).length +
      b.cats.filter((c) => !f.cats.includes(c)).length +
      (f.thr > 0 ? 1 : 0) +
      (f.showNR !== b.showNR ? 1 : 0) +
      (f.showCor !== b.showCor ? 1 : 0) +
      (f.weak !== b.weak ? 1 : 0)
    );
  };

  /** @param {AppState} st */
  function sync(st) {
    const n = activeCount(st);
    badge.textContent = String(n);
    badge.style.display = n ? 'flex' : 'none';
    reset.style.visibility = n ? 'visible' : 'hidden';
    for (const [b, isOn] of chips) b.classList.toggle('on', isOn(st));
    thrEl.value = String(st.filters.thr);
    thrv.textContent = st.filters.thr.toFixed(2);
    paintThr();
    for (const [el, , get] of tg) el.classList.toggle('on', get(st));
  }

  sync(store.get());
  store.subscribe((st) => sync(st));
}
