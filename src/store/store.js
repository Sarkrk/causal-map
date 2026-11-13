// @ts-check
// 단일 상태 저장소. dispatch마다 새 상태 객체를 만들고 이전 객체는 바꾸지 않는다.
// filters·prefs·view.hop·view.dir만 storage(JSON)에 저장한다. selected·tab·flatAll은 저장하지 않는다.
import { LEVELS, CATEGORY_ORDER } from './labels.js';

/**
 * @typedef {Object} Filters
 * @property {string[]} levels
 * @property {string[]} cats
 * @property {number} thr
 * @property {boolean} showNR
 * @property {boolean} showCor
 */

/**
 * @typedef {Object} View
 * @property {string|null} selected
 * @property {1|2} hop
 * @property {'both'|'up'|'down'} dir
 * @property {'map'|'in'|'out'|'cor'} tab
 * @property {boolean} flatAll
 */

/**
 * @typedef {Object} Prefs
 * @property {boolean} labAll
 * @property {boolean} hideOrph
 * @property {boolean} autoSpin
 * @property {boolean} wobble
 */

/**
 * @typedef {Object} AppState
 * @property {Filters} filters
 * @property {View} view
 * @property {Prefs} prefs
 */

/**
 * @typedef {{type:'select', id:string}
 *   | {type:'deselect'}
 *   | {type:'toggleLevel', level:string}
 *   | {type:'toggleCat', cat:string}
 *   | {type:'setThr', value:number}
 *   | {type:'toggle', key:'showNR'|'showCor'|'labAll'|'hideOrph'|'autoSpin'|'wobble'}
 *   | {type:'setHop', hop:1|2}
 *   | {type:'setDir', dir:'both'|'up'|'down'}
 *   | {type:'setTab', tab:'map'|'in'|'out'|'cor'}
 *   | {type:'toggleFlatAll'}} Action
 */

/** @typedef {(state: AppState, prev: AppState, action: Action) => void} Listener */

/** @typedef {ReturnType<typeof createStore>} Store */

/**
 * @typedef {Object} StorageLike
 * @property {(k: string) => string | null} getItem
 * @property {(k: string, v: string) => void} setItem
 */

const DIRS = ['both', 'up', 'down'];
const TABS = ['map', 'in', 'out', 'cor'];
const FILTER_KEYS = ['showNR', 'showCor'];
const PREF_KEYS = ['labAll', 'hideOrph', 'autoSpin', 'wobble'];

/**
 * 원본 app.js 기본값과 같은 초기 상태.
 * @param {string[]} categories  데이터에 있는 범주(categoriesPresent 결과)
 * @returns {AppState}
 */
export function initialState(categories) {
  return {
    filters: { levels: LEVELS.slice(), cats: categories.slice(), thr: 0, showNR: true, showCor: false },
    view: { selected: null, hop: 1, dir: 'both', tab: 'in', flatAll: false },
    prefs: { labAll: false, hideOrph: true, autoSpin: true, wobble: true },
  };
}

/**
 * 기본 저장소(globalThis.localStorage). 접근이 막히면 undefined.
 * @returns {StorageLike|undefined}
 */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {AppState} s
 * @param {Action} a
 * @returns {AppState}
 */
function reduce(s, a) {
  switch (a.type) {
    case 'select':
      return { ...s, view: { ...s.view, selected: a.id, flatAll: false, tab: 'map' } };
    case 'deselect':
      return { ...s, view: { ...s.view, selected: null } };
    case 'toggleLevel': {
      const on = s.filters.levels.includes(a.level);
      const levels = LEVELS.filter((l) => (l === a.level ? !on : s.filters.levels.includes(l)));
      return { ...s, filters: { ...s.filters, levels } };
    }
    case 'toggleCat': {
      const on = s.filters.cats.includes(a.cat);
      const cats = on ? s.filters.cats.filter((c) => c !== a.cat) : [...s.filters.cats, a.cat];
      return { ...s, filters: { ...s.filters, cats } };
    }
    case 'setThr': {
      if (!Number.isFinite(a.value)) return s;
      const thr = Math.min(1, Math.max(0, a.value));
      return { ...s, filters: { ...s.filters, thr } };
    }
    case 'toggle': {
      if (FILTER_KEYS.includes(a.key)) {
        const key = /** @type {'showNR'|'showCor'} */ (a.key);
        return { ...s, filters: { ...s.filters, [key]: !s.filters[key] } };
      }
      if (PREF_KEYS.includes(a.key)) {
        const key = /** @type {'labAll'|'hideOrph'|'autoSpin'|'wobble'} */ (a.key);
        return { ...s, prefs: { ...s.prefs, [key]: !s.prefs[key] } };
      }
      throw new TypeError(`unknown toggle key: ${String(a.key)}`);
    }
    case 'setHop':
      return a.hop === 1 || a.hop === 2 ? { ...s, view: { ...s.view, hop: a.hop } } : s;
    case 'setDir':
      return DIRS.includes(a.dir) ? { ...s, view: { ...s.view, dir: a.dir } } : s;
    case 'setTab':
      return TABS.includes(a.tab) ? { ...s, view: { ...s.view, tab: a.tab } } : s;
    case 'toggleFlatAll':
      return { ...s, view: { ...s.view, flatAll: !s.view.flatAll } };
    default:
      throw new TypeError(`unknown action: ${String(/** @type {{type?:unknown}} */ (a).type)}`);
  }
}

/** @param {unknown} x @returns {Record<string, any>} */
function obj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x) ? /** @type {Record<string, any>} */ (x) : {};
}

/**
 * 저장된 값을 읽는다. 깨졌으면 null.
 * @param {string} key
 * @param {StorageLike|undefined} storage
 * @returns {Record<string, any>|null}
 */
function readSaved(key, storage) {
  try {
    const raw = storage ? storage.getItem(key) : null;
    if (raw == null) return null;
    const v = JSON.parse(raw);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * 저장값을 초기 상태 위에 덮는다. 항목마다 타입·범위를 검사해 틀린 것은 기본값을 쓴다.
 * @param {AppState} initial
 * @param {string} key
 * @param {StorageLike|undefined} storage
 * @returns {AppState}
 */
function restore(initial, key, storage) {
  const saved = readSaved(key, storage);
  if (!saved) return initial;
  const f = obj(saved.filters);
  const p = obj(saved.prefs);
  const v = obj(saved.view);
  const bool = (/** @type {unknown} */ x, /** @type {boolean} */ d) => (typeof x === 'boolean' ? x : d);
  const levels =
    Array.isArray(f.levels) && f.levels.every((x) => LEVELS.includes(x))
      ? LEVELS.filter((l) => f.levels.includes(l))
      : initial.filters.levels;
  const cats =
    Array.isArray(f.cats) && f.cats.every((x) => typeof x === 'string' && CATEGORY_ORDER.includes(x))
      ? [...new Set(/** @type {string[]} */ (f.cats))]
      : initial.filters.cats;
  const thr = typeof f.thr === 'number' && f.thr >= 0 && f.thr <= 1 ? f.thr : initial.filters.thr;
  return {
    filters: {
      levels,
      cats,
      thr,
      showNR: bool(f.showNR, initial.filters.showNR),
      showCor: bool(f.showCor, initial.filters.showCor),
    },
    prefs: {
      labAll: bool(p.labAll, initial.prefs.labAll),
      hideOrph: bool(p.hideOrph, initial.prefs.hideOrph),
      autoSpin: bool(p.autoSpin, initial.prefs.autoSpin),
      wobble: bool(p.wobble, initial.prefs.wobble),
    },
    view: {
      ...initial.view,
      hop: v.hop === 1 || v.hop === 2 ? v.hop : initial.view.hop,
      dir: DIRS.includes(v.dir) ? v.dir : initial.view.dir,
    },
  };
}

/**
 * @param {string} key
 * @param {StorageLike|undefined} storage
 * @param {AppState} s
 */
function save(key, storage, s) {
  try {
    storage?.setItem(
      key,
      JSON.stringify({
        filters: s.filters,
        prefs: s.prefs,
        view: { hop: s.view.hop, dir: s.view.dir },
      }),
    );
  } catch {
    // 저장 실패(용량·사생활 보호 모드)는 무시: 화면 동작에는 영향 없음
  }
}

/**
 * @param {AppState} initial
 * @param {{persistKey?: string, storage?: StorageLike|undefined}} [opts]
 */
export function createStore(initial, { persistKey = 'cg_view', storage = defaultStorage() } = {}) {
  let state = restore(initial, persistKey, storage);
  /** @type {Set<Listener>} */
  const subs = new Set();
  return {
    /** @returns {AppState} */
    get() {
      return state;
    },
    /** @param {Action} action */
    dispatch(action) {
      const prev = state;
      state = reduce(prev, action);
      if (
        state.filters !== prev.filters ||
        state.prefs !== prev.prefs ||
        state.view.hop !== prev.view.hop ||
        state.view.dir !== prev.view.dir
      ) {
        save(persistKey, storage, state);
      }
      for (const fn of [...subs]) fn(state, prev, action);
    },
    /**
     * @param {Listener} fn
     * @returns {() => void} 구독 해제
     */
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
