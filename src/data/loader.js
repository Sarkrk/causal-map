// @ts-check
// 데이터 로딩: 캐시('cg_data') → migrate → validate. 실패하면 캐시를 지우고 graph.json을 다시 받아 같은 검사를 한다.
// 성공한 원본 JSON만 캐시에 저장한다.
import { migrate } from '../schema/migrate.js';
import { validateGraph } from '../schema/validate.js';

/** @typedef {import('../types.js').GraphData} GraphData */

export const CACHE_KEY = 'cg_data';
export const LOAD_FAIL_MSG = '데이터를 받지 못했습니다. 인터넷 연결 후 다시 열어 주세요.';

/**
 * @typedef {Object} StorageLike
 * @property {(k: string) => string | null} getItem
 * @property {(k: string, v: string) => void} setItem
 * @property {(k: string) => void} removeItem
 */

/**
 * 원본 JSON을 v1으로 바꾸고 검증한다. 실패하면 Error.
 * @param {unknown} raw
 * @returns {GraphData}
 */
export function checked(raw) {
  const d = migrate(raw);
  const v = validateGraph(d);
  if (!v.ok) throw new Error(v.errors.slice(0, 3).join('; ') || 'invalid graph data');
  return d;
}

/**
 * 캐시에서 원본 JSON 문자열을 읽어 파싱한다. 없으면 null, 깨졌으면 'broken'.
 * @param {StorageLike} storage
 * @returns {unknown|null|'broken'}
 */
function readCache(storage) {
  let raw;
  try {
    raw = storage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return 'broken';
  }
}

/**
 * @param {StorageLike} storage
 */
function dropCache(storage) {
  try {
    storage.removeItem(CACHE_KEY);
  } catch {
    // 지우기 실패는 무시: 다음 저장 때 덮어쓴다
  }
}

/**
 * 데이터를 읽는다. 캐시가 유효하면 네트워크를 타지 않는다.
 * @param {{storage?: StorageLike, fetchFn?: (url: string, init?: RequestInit) => Promise<Response>}} [opts]
 * @returns {Promise<{data: GraphData, source: 'cache'|'network'}>}
 * @throws {Error} 캐시·네트워크 모두 실패
 */
export async function loadGraph(opts = {}) {
  const storage = opts.storage ?? /** @type {StorageLike} */ (globalThis.localStorage);
  const fetchFn = opts.fetchFn ?? ((url, init) => globalThis.fetch(url, init));

  const cached = readCache(storage);
  if (cached !== null) {
    try {
      if (cached === 'broken') throw new Error('broken cache');
      return { data: checked(cached), source: 'cache' };
    } catch {
      dropCache(storage);
    }
  }

  const r = await fetchFn('graph.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const raw = await r.json();
  const data = checked(raw);
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(raw));
  } catch {
    // 저장 실패(용량)는 무시: 이번 세션은 받은 데이터로 연다
  }
  return { data, source: 'network' };
}
