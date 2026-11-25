// @ts-check
// 단일 상태 저장소. dispatch마다 새 상태 객체를 만들고 이전 객체는 바꾸지 않는다.
// filters·prefs·view.hop·dir·pathTo·pathRev·pathQuery·search·sim을 storage(JSON)에 저장한다. selected·tab·flatAll·trace는 저장하지 않는다.
// 복원 때 pathTo는 nodeIds(알려진 노드 id 목록)가 주어지고 그 안에 있을 때만 살린다.
import { LEVELS, SECTOR_ORDER, TIER_ORDER } from './labels.js';
import { REGIMES } from '../schema/v2.js';

/**
 * @typedef {Object} Filters
 * @property {string[]} levels
 * @property {string[]} sectors   구심점 섹터 필터. 빈 배열이면 전부 숨김. (옛 cats 필터는 11/25 제거)
 * @property {string[]} tiers     노드 티어 필터(v3): core·bridge·econ.
 * @property {number} thr
 * @property {boolean} showNR
 * @property {boolean} showCor
 * @property {boolean} weak   B- 등급(약한 근거) 연결 포함 여부
 */

/**
 * 충격 시뮬레이션 입력(결과는 저장하지 않고 렌더 때 계산). start가 null이면 아직 실행 전.
 * @typedef {Object} SimInput
 * @property {string|null} start
 * @property {1|-1} sign
 * @property {string|null} regime   null=평시 가정, 아니면 REGIMES 중 하나
 * @property {number} depth         2~6
 */

/**
 * @typedef {Object} View
 * @property {string|null} selected
 * @property {1|2} hop
 * @property {'both'|'up'|'down'} dir
 * @property {'map'|'in'|'out'|'cor'|'loop'|'path'|'sim'} tab
 * @property {boolean} flatAll
 * @property {Trace|null} trace    루프·경로 탭에서 고른 한 개(캔버스·관계도 강조용)
 * @property {string|null} pathTo   경로 탭의 도착 노드 id
 * @property {boolean} pathRev      경로 방향 반전(true면 도착→선택 노드). 선택·도착 쌍이 바뀌면 false로 돌아간다
 * @property {string} pathQuery     경로 탭 도착 노드 검색어(탭을 오가도 유지)
 * @property {string} search        상단 검색창 검색어
 * @property {SimInput} sim         충격 시뮬레이션 입력
 */

/**
 * @typedef {Object} Trace
 * @property {'loop'|'path'} kind
 * @property {string[]} nodes   순서대로
 * @property {string[]} edges   엣지 id 순서대로
 */

/**
 * @typedef {Object} Prefs
 * @property {boolean} labAll
 * @property {boolean} hideOrph
 * @property {boolean} autoSpin
 * @property {boolean} wobble
 * @property {boolean} showState
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
 *   | {type:'toggleSector', sector:string}
 *   | {type:'soloSector', sector:string}
 *   | {type:'toggleTier', tier:string}
 *   | {type:'setTiers', tiers:string[]}
 *   | {type:'setThr', value:number}
 *   | {type:'resetFilters', filters:Filters}
 *   | {type:'toggle', key:'showNR'|'showCor'|'weak'|'labAll'|'hideOrph'|'autoSpin'|'wobble'|'showState'}
 *   | {type:'setHop', hop:1|2}
 *   | {type:'setDir', dir:'both'|'up'|'down'}
 *   | {type:'setTab', tab:'map'|'in'|'out'|'cor'|'loop'|'path'|'sim'}
 *   | {type:'toggleFlatAll'}
 *   | {type:'setTrace', trace:Trace}
 *   | {type:'clearTrace'}
 *   | {type:'setPathTo', id:string|null}
   | {type:'togglePathRev'}
   | {type:'setPathQuery', value:string}
   | {type:'setSearch', value:string}
   | {type:'setSim', patch:{sign?:number, regime?:string|null, depth?:number}}
   | {type:'runSim'}
 *   | {type:'restoreView', selected:string|null, tab?:string, dir?:string, hop?:number, pathTo?:string|null}} Action
 */

/** @typedef {(state: AppState, prev: AppState, action: Action) => void} Listener */

/** @typedef {ReturnType<typeof createStore>} Store */

/**
 * @typedef {Object} StorageLike
 * @property {(k: string) => string | null} getItem
 * @property {(k: string, v: string) => void} setItem
 */

const DIRS = ['both', 'up', 'down'];
const TABS = ['map', 'in', 'out', 'cor', 'loop', 'path', 'sim'];
export const SIM_DEPTH_MIN = 2;
export const SIM_DEPTH_MAX = 6;
/** @type {SimInput} */
const SIM_DEFAULT = { start: null, sign: 1, regime: null, depth: 4 };
const FILTER_KEYS = ['showNR', 'showCor', 'weak'];
const PREF_KEYS = ['labAll', 'hideOrph', 'autoSpin', 'wobble', 'showState'];
const ALL_TIERS = [...TIER_ORDER];

/**
 * 원본 app.js 기본값과 같은 초기 상태.
 * @param {string[]} [sectors]   데이터에 있는 섹터(sectorsPresent 결과). 없으면 전체 섹터.
 * @returns {AppState}
 */
export function initialState(sectors) {
  return {
    filters: { levels: LEVELS.slice(), sectors: (sectors ?? SECTOR_ORDER).slice(), tiers: ALL_TIERS.slice(), thr: 0, showNR: true, showCor: false, weak: true },
    view: { selected: null, hop: 1, dir: 'both', tab: 'in', flatAll: false, trace: null, pathTo: null, pathRev: false, pathQuery: '', search: '', sim: SIM_DEFAULT },
    prefs: { labAll: false, hideOrph: true, autoSpin: true, wobble: true, showState: true },
  };
}

/**
 * 앱 첫 화면용 기본 상태: 확실·유력(A, B+) 연결 및 핵심+연결 티어만. 이론·배경(econ)·약한 근거(B-)는 보기 설정에서 켠다.
 * @param {string[]} [sectors]
 * @returns {AppState}
 */
export function defaultState(sectors) {
  const s = initialState(sectors);
  return { ...s, filters: { ...s.filters, levels: ['A', 'B'], tiers: ['core', 'bridge'], weak: false } };
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
      return { ...s, view: { ...s.view, selected: a.id, flatAll: false, tab: 'map', trace: null, pathTo: null, pathRev: false, pathQuery: '' } };
    case 'deselect':
      return { ...s, view: { ...s.view, selected: null, trace: null, pathTo: null, pathRev: false, pathQuery: '' } };
    case 'toggleLevel': {
      const on = s.filters.levels.includes(a.level);
      const levels = LEVELS.filter((l) => (l === a.level ? !on : s.filters.levels.includes(l)));
      return { ...s, filters: { ...s.filters, levels } };
    }
    case 'toggleSector': {
      if (!SECTOR_ORDER.includes(a.sector)) return s;
      const on = s.filters.sectors.includes(a.sector);
      const sectors = on ? s.filters.sectors.filter((c) => c !== a.sector) : SECTOR_ORDER.filter((c) => c === a.sector || s.filters.sectors.includes(c));
      return { ...s, filters: { ...s.filters, sectors } };
    }
    case 'soloSector': {
      // 허브 클릭: 이미 그 섹터만 보이면 전체 복원, 아니면 그 섹터만.
      if (!SECTOR_ORDER.includes(a.sector)) return s;
      const solo = s.filters.sectors.length === 1 && s.filters.sectors[0] === a.sector;
      const sectors = solo ? SECTOR_ORDER.slice() : [a.sector];
      return { ...s, filters: { ...s.filters, sectors } };
    }
    case 'toggleTier': {
      if (!ALL_TIERS.includes(/** @type {any} */ (a.tier))) return s;
      const cur = s.filters.tiers ?? ALL_TIERS;
      const on = cur.includes(a.tier);
      const tiers = on ? cur.filter((t) => t !== a.tier) : ALL_TIERS.filter((t) => t === a.tier || cur.includes(t));
      return { ...s, filters: { ...s.filters, tiers } };
    }
    case 'setTiers': {
      if (!Array.isArray(a.tiers)) return s;
      const tiers = ALL_TIERS.filter((t) => a.tiers.includes(t));
      return { ...s, filters: { ...s.filters, tiers } };
    }
    case 'setThr': {
      if (!Number.isFinite(a.value)) return s;
      const thr = Math.min(1, Math.max(0, a.value));
      return { ...s, filters: { ...s.filters, thr } };
    }
    case 'toggle': {
      if (FILTER_KEYS.includes(a.key)) {
        const key = /** @type {'showNR'|'showCor'|'weak'} */ (a.key);
        return { ...s, filters: { ...s.filters, [key]: !s.filters[key] } };
      }
      if (PREF_KEYS.includes(a.key)) {
        const key = /** @type {'labAll'|'hideOrph'|'autoSpin'|'wobble'|'showState'} */ (a.key);
        return { ...s, prefs: { ...s.prefs, [key]: !s.prefs[key] } };
      }
      throw new TypeError(`unknown toggle key: ${String(a.key)}`);
    }
    case 'resetFilters': {
      // 호출자가 initialState(...).filters를 넘긴다. 복사해서 저장한다.
      const f = a.filters;
      return { ...s, filters: { ...f, levels: f.levels.slice(), sectors: (f.sectors ?? SECTOR_ORDER).slice(), tiers: (f.tiers ?? ALL_TIERS).slice() } };
    }
    case 'setHop':
      return a.hop === 1 || a.hop === 2 ? { ...s, view: { ...s.view, hop: a.hop } } : s;
    case 'setDir':
      return DIRS.includes(a.dir) ? { ...s, view: { ...s.view, dir: a.dir } } : s;
    case 'setTab':
      return TABS.includes(a.tab) ? { ...s, view: { ...s.view, tab: a.tab, trace: null } } : s;
    case 'toggleFlatAll':
      return { ...s, view: { ...s.view, flatAll: !s.view.flatAll } };
    case 'setTrace': {
      const t = a.trace;
      if (!t || (t.kind !== 'loop' && t.kind !== 'path') || !Array.isArray(t.nodes) || !Array.isArray(t.edges)) return s;
      return { ...s, view: { ...s.view, trace: { kind: t.kind, nodes: t.nodes.slice(), edges: t.edges.slice() } } };
    }
    case 'clearTrace':
      return s.view.trace ? { ...s, view: { ...s.view, trace: null } } : s;
    case 'setPathTo': {
      const pathTo = typeof a.id === 'string' ? a.id : null;
      // 도착 노드가 바뀌면 정방향으로 돌아간다
      return { ...s, view: { ...s.view, pathTo, pathRev: pathTo === s.view.pathTo ? s.view.pathRev : false, trace: null } };
    }
    case 'togglePathRev':
      return { ...s, view: { ...s.view, pathRev: !s.view.pathRev, trace: null } };
    case 'setPathQuery':
      return typeof a.value === 'string' ? { ...s, view: { ...s.view, pathQuery: a.value } } : s;
    case 'setSearch':
      return typeof a.value === 'string' ? { ...s, view: { ...s.view, search: a.value } } : s;
    case 'setSim': {
      // 입력을 바꾸면 이전 결과는 무효(start=null). 다시 '실행'을 눌러야 계산된다.
      const p = a.patch ?? {};
      const cur = s.view.sim;
      const sign = p.sign === 1 || p.sign === -1 ? p.sign : cur.sign;
      const regime = p.regime === null ? null : typeof p.regime === 'string' && REGIMES.includes(p.regime) ? p.regime : cur.regime;
      const depth =
        typeof p.depth === 'number' && Number.isInteger(p.depth) && p.depth >= SIM_DEPTH_MIN && p.depth <= SIM_DEPTH_MAX ? p.depth : cur.depth;
      return { ...s, view: { ...s.view, sim: { start: null, sign, regime, depth }, trace: null } };
    }
    case 'runSim':
      return s.view.selected ? { ...s, view: { ...s.view, sim: { ...s.view.sim, start: s.view.selected }, trace: null } } : s;
    case 'restoreView': {
      // 주소(#...)·뒤로 가기 복원용. 값 검증은 여기서, 노드 존재 확인은 호출자가 한다.
      const v = s.view;
      const sel = typeof a.selected === 'string' ? a.selected : null;
      const samePair = sel !== null && sel === v.selected && typeof a.pathTo === 'string' && a.pathTo === v.pathTo;
      return {
        ...s,
        view: {
          ...v,
          selected: sel,
          tab: sel && TABS.includes(/** @type {any} */ (a.tab)) ? /** @type {View['tab']} */ (a.tab) : sel ? 'map' : v.tab,
          dir: DIRS.includes(/** @type {any} */ (a.dir)) ? /** @type {View['dir']} */ (a.dir) : v.dir,
          hop: a.hop === 1 || a.hop === 2 ? a.hop : v.hop,
          pathTo: sel && typeof a.pathTo === 'string' ? a.pathTo : null,
          // 같은 (선택, 도착) 쌍이면 반전·검색어를 유지하고, 다르면 초기화
          pathRev: samePair ? v.pathRev : false,
          pathQuery: samePair ? v.pathQuery : '',
          trace: null,
          flatAll: false,
        },
      };
    }
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
 * @param {ReadonlySet<string>|undefined} nodeIds  알려진 노드 id. 없으면 pathTo는 복원하지 않는다
 * @returns {AppState}
 */
function restore(initial, key, storage, nodeIds) {
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
  const sectors =
    Array.isArray(f.sectors) && f.sectors.every((x) => typeof x === 'string' && SECTOR_ORDER.includes(x))
      ? SECTOR_ORDER.filter((x) => /** @type {string[]} */ (f.sectors).includes(x))
      : initial.filters.sectors;
  const tiers =
    Array.isArray(f.tiers) && f.tiers.every((x) => typeof x === 'string' && ALL_TIERS.includes(/** @type {any} */ (x)))
      ? ALL_TIERS.filter((x) => /** @type {string[]} */ (f.tiers).includes(x))
      : initial.filters.tiers;
  const thr = typeof f.thr === 'number' && f.thr >= 0 && f.thr <= 1 ? f.thr : initial.filters.thr;
  const pathTo = typeof v.pathTo === 'string' && nodeIds?.has(v.pathTo) ? v.pathTo : null;
  const sv = obj(v.sim);
  /** @type {SimInput} */
  const sim = {
    start: typeof sv.start === 'string' && nodeIds?.has(sv.start) ? sv.start : null,
    sign: sv.sign === -1 ? -1 : 1,
    regime: typeof sv.regime === 'string' && REGIMES.includes(sv.regime) ? sv.regime : null,
    depth: Number.isInteger(sv.depth) && sv.depth >= SIM_DEPTH_MIN && sv.depth <= SIM_DEPTH_MAX ? sv.depth : SIM_DEFAULT.depth,
  };
  return {
    filters: {
      levels,
      sectors,
      tiers,
      thr,
      showNR: bool(f.showNR, initial.filters.showNR),
      showCor: bool(f.showCor, initial.filters.showCor),
      weak: bool(f.weak, initial.filters.weak),
    },
    prefs: {
      labAll: bool(p.labAll, initial.prefs.labAll),
      hideOrph: bool(p.hideOrph, initial.prefs.hideOrph),
      autoSpin: bool(p.autoSpin, initial.prefs.autoSpin),
      wobble: bool(p.wobble, initial.prefs.wobble),
      showState: bool(p.showState, initial.prefs.showState),
    },
    view: {
      ...initial.view,
      hop: v.hop === 1 || v.hop === 2 ? v.hop : initial.view.hop,
      dir: DIRS.includes(v.dir) ? v.dir : initial.view.dir,
      pathTo,
      pathRev: pathTo !== null && v.pathRev === true,
      pathQuery: typeof v.pathQuery === 'string' ? v.pathQuery.slice(0, 200) : initial.view.pathQuery,
      search: typeof v.search === 'string' ? v.search.slice(0, 200) : initial.view.search,
      sim,
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
        view: {
          hop: s.view.hop,
          dir: s.view.dir,
          pathTo: s.view.pathTo,
          pathRev: s.view.pathRev,
          pathQuery: s.view.pathQuery,
          search: s.view.search,
          sim: s.view.sim,
        },
      }),
    );
  } catch {
    // 저장 실패(용량·사생활 보호 모드)는 무시: 화면 동작에는 영향 없음
  }
}

/**
 * @param {AppState} initial
 * @param {{persistKey?: string, storage?: StorageLike|undefined, nodeIds?: Iterable<string>}} [opts]
 */
export function createStore(initial, { persistKey = 'cg_view', storage = defaultStorage(), nodeIds } = {}) {
  let state = restore(initial, persistKey, storage, nodeIds ? new Set(nodeIds) : undefined);
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
        state.view.dir !== prev.view.dir ||
        state.view.pathTo !== prev.view.pathTo ||
        state.view.pathRev !== prev.view.pathRev ||
        state.view.pathQuery !== prev.view.pathQuery ||
        state.view.search !== prev.view.search ||
        state.view.sim !== prev.view.sim
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
