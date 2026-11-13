// @ts-check
// 주소 해시로 보기 상태를 주고받는다: #n=<노드>&t=<탭>&d=<방향>&h=<단계>&to=<도착>.
// 상태 변경은 store의 select·deselect·restoreView만 쓴다. 기본값인 항목은 주소에서 뺀다.
// 주소 한 줄이 보기 전체를 뜻한다: 주소에 없는 항목은 기본값(탭 map, 방향 both, 단계 1, 도착 없음)이다.

/** @typedef {import('../store/store.js').Store} Store */
/** @typedef {import('../types.js').Graph} Graph */

/**
 * @typedef {Object} RouteParsed
 * @property {string} selected
 * @property {'map'|'in'|'out'|'cor'|'loop'|'path'|'sim'} [tab]
 * @property {'both'|'up'|'down'} [dir]
 * @property {1|2} [hop]
 * @property {string} [pathTo]
 */

/**
 * @typedef {Object} ViewLike
 * @property {string|null} selected
 * @property {string} [tab]
 * @property {string} [dir]
 * @property {number} [hop]
 * @property {string|null} [pathTo]
 */

const TABS = /** @type {readonly string[]} */ (['map', 'in', 'out', 'cor', 'loop', 'path', 'sim']);
const DIRS = /** @type {readonly string[]} */ (['both', 'up', 'down']);

/**
 * 주소 해시를 읽는다. 선택 노드(n)가 없거나 %-인코딩이 깨지면 null.
 * 모르는 키와 잘못된 t·d·h·to 값은 무시한다(기본값으로 둔다).
 * @param {string} hash  '#n=...' 또는 'n=...' (앞의 '#'은 선택)
 * @returns {RouteParsed|null}
 */
export function parseHash(hash) {
  if (typeof hash !== 'string') return null;
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!body) return null;
  /** @type {Map<string, string>} */
  const kv = new Map();
  for (const part of body.split('&')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const k = part.slice(0, i);
    if (kv.has(k)) continue;
    try {
      kv.set(k, decodeURIComponent(part.slice(i + 1)));
    } catch {
      return null;
    }
  }
  const n = kv.get('n');
  if (!n) return null;
  /** @type {RouteParsed} */
  const out = { selected: n };
  const t = kv.get('t');
  if (t && TABS.includes(t)) out.tab = /** @type {RouteParsed['tab']} */ (t);
  const d = kv.get('d');
  if (d && DIRS.includes(d)) out.dir = /** @type {RouteParsed['dir']} */ (d);
  const h = kv.get('h');
  if (h === '1' || h === '2') out.hop = h === '2' ? 2 : 1;
  const to = kv.get('to');
  if (to) out.pathTo = to;
  return out;
}

/**
 * 보기 상태 → 주소 해시. 선택이 없으면 ''. 기본값(탭 map, 방향 both, 단계 1, 도착 없음)은 생략한다.
 * @param {ViewLike} view
 * @returns {string}
 */
export function toHash(view) {
  if (!view.selected) return '';
  const parts = [`n=${encodeURIComponent(view.selected)}`];
  if (view.tab && view.tab !== 'map') parts.push(`t=${encodeURIComponent(view.tab)}`);
  if (view.dir && view.dir !== 'both') parts.push(`d=${encodeURIComponent(view.dir)}`);
  if (view.hop && view.hop !== 1) parts.push(`h=${view.hop}`);
  if (view.pathTo) parts.push(`to=${encodeURIComponent(view.pathTo)}`);
  return '#' + parts.join('&');
}

/**
 * 주소 경로(pathname+search). 해시는 뺀다.
 * @param {any} win
 * @returns {string}
 */
function pathOf(win) {
  return win.location.pathname + (win.location.search || '');
}

/**
 * 주소를 현재 보기 상태에 맞춘다. 주소가 이미 같으면 아무것도 하지 않는다.
 * @param {any} win
 * @param {Store} store
 * @param {'push'|'replace'} mode
 */
function writeUrl(win, store, mode) {
  const v = store.get().view;
  const next = pathOf(win) + (v.selected ? toHash(v) : '');
  const cur = pathOf(win) + (win.location.hash || '');
  if (next === cur) return;
  if (mode === 'push') win.history.pushState(null, '', next);
  else win.history.replaceState(null, '', next);
}

/**
 * 주소로 읽은 보기와 현재 상태가 같은지.
 * @param {RouteParsed} p  기본값을 채운 값
 * @param {import('../store/store.js').View} v
 */
function sameView(p, v) {
  return (
    p.selected === v.selected &&
    (p.tab ?? 'map') === v.tab &&
    (p.dir ?? 'both') === v.dir &&
    (p.hop ?? 1) === v.hop &&
    (p.pathTo ?? null) === (v.pathTo ?? null)
  );
}

/**
 * 주소로 노드 보기를 연다·복원한다. 부팅·뒤로 가기·앞으로 가기·직접 주소 수정에 쓴다.
 *  - 부팅: 주소가 가리키는 노드가 있으면 연다. 없으면 주소의 해시만 지운다.
 *  - store 변경: 선택이 바뀌면 주소를 새 항목으로 push, 그 밖(탭·방향·단계·도착)은 replace.
 *  - popstate·hashchange: 주소를 읽어 같은 보기로 맞춘다(뒤로 가기 = 이전 노드). 맨 처음이면 시트가 닫힌다.
 * 노드를 새로 열 때는 onOpenNode(id)를 먼저 부른다(main.js: 카메라 이동·시트 열기). 그 뒤 restoreView로 탭·방향·단계·도착을 맞춘다.
 *
 * @param {{graph: Graph, store: Store, onOpenNode: (id: string) => void, win?: any}} o
 *   win: window 대체(테스트용). 기본 globalThis. location·history·addEventListener를 쓴다.
 * @returns {{dispose: () => void}}
 */
export function initRoute(o) {
  const { graph, store, onOpenNode } = o;
  const win = o.win ?? globalThis;
  let applying = false;

  /**
   * 주소 값을 검증한다. 노드가 없으면 null, 도착 노드가 없으면 도착만 버린다.
   * @param {RouteParsed|null} p
   * @returns {RouteParsed|null}
   */
  function resolve(p) {
    if (!p || !graph.byId.has(p.selected)) return null;
    /** @type {RouteParsed} */
    const r = { selected: p.selected, tab: p.tab ?? 'map', dir: p.dir ?? 'both', hop: p.hop ?? 1 };
    if (p.pathTo && graph.byId.has(p.pathTo)) r.pathTo = p.pathTo;
    return r;
  }

  /**
   * 검증된 값을 화면에 적용한다. 호출자가 applying 가드 안에서 부른다.
   * @param {RouteParsed|null} v
   */
  function apply(v) {
    const cur = store.get().view;
    if (!v) {
      if (cur.selected) store.dispatch({ type: 'deselect' });
      return;
    }
    if (v.selected !== cur.selected) onOpenNode(v.selected);
    store.dispatch({
      type: 'restoreView',
      selected: v.selected,
      tab: v.tab,
      dir: v.dir,
      hop: v.hop,
      pathTo: v.pathTo ?? null,
    });
  }

  /** @param {() => void} fn */
  function guarded(fn) {
    applying = true;
    try {
      fn();
    } finally {
      applying = false;
    }
  }

  const unsub = store.subscribe((st, prev) => {
    if (applying) return;
    const v = st.view;
    const p = prev.view;
    if (v.selected !== p.selected) writeUrl(win, store, 'push');
    else if (v.tab !== p.tab || v.dir !== p.dir || v.hop !== p.hop || v.pathTo !== p.pathTo) writeUrl(win, store, 'replace');
  });

  const onPop = () => {
    const v = resolve(parseHash(win.location.hash));
    const cur = store.get().view;
    const same = v ? sameView(v, cur) : !cur.selected;
    if (!same) guarded(() => apply(v));
    writeUrl(win, store, 'replace');
  };
  win.addEventListener('popstate', onPop);
  win.addEventListener('hashchange', onPop);

  // 부팅: 주소가 가리키는 보기를 연다. 없으면 주소를 정리한다.
  guarded(() => apply(resolve(parseHash(win.location.hash))));
  writeUrl(win, store, 'replace');

  return {
    dispose() {
      unsub();
      win.removeEventListener('popstate', onPop);
      win.removeEventListener('hashchange', onPop);
    },
  };
}

/**
 * 현재 노드의 절대 링크를 공유한다. navigator.share → clipboard → prompt 순서.
 * @param {ViewLike} view
 * @param {string} name  노드 표시 이름(공유 제목에 쓴다)
 * @param {{win?: any, nav?: any, notify?: (msg: string) => void, prompt?: (msg: string, value: string) => unknown}} [env]
 * @returns {Promise<'shared'|'copied'|'prompted'|'cancelled'>}
 */
export async function shareLink(view, name, env = {}) {
  const win = env.win ?? globalThis;
  const nav = env.nav ?? /** @type {any} */ (globalThis).navigator;
  const notify = env.notify ?? (() => {});
  const url = win.location.origin + win.location.pathname + toHash(view);
  const title = '인과 지도 · ' + name;

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title, url });
      return 'shared';
    } catch (e) {
      if (/** @type {any} */ (e)?.name === 'AbortError') return 'cancelled';
    }
  }
  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(url);
      notify('링크를 복사했습니다');
      return 'copied';
    } catch {
      // 아래 prompt로 넘어간다
    }
  }
  const ask = env.prompt ?? ((msg, value) => win.prompt?.(msg, value));
  ask('아래 주소를 복사해 주세요', url);
  return 'prompted';
}
