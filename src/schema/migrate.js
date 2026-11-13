// @ts-check
// graph.json 마이그레이션: v0(구 형식, schemaVersion 없음) → v1. 입력 객체는 변경하지 않는다.

/** @typedef {import('../types.js').GraphData} GraphData */

export const SCHEMA_VERSION = 1;

/**
 * 구 형식(v0)의 evidence 문자열을 배열로 바꾼다.
 * 예: '데이터·지지, 문헌·지지' → [{kind:'데이터',stance:'지지'},{kind:'문헌',stance:'지지'}]
 * @param {unknown} s  구 형식 ev 값 (문자열, 없으면 null/undefined)
 * @returns {{kind:string,stance:string}[]}
 */
function parseEvidence(s) {
  if (typeof s !== 'string' || s.trim() === '') return [];
  return s
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => {
      const i = p.indexOf('·');
      return i < 0
        ? { kind: p, stance: '' }
        : { kind: p.slice(0, i), stance: p.slice(i + 1) };
    });
}

/**
 * @param {unknown} x
 * @returns {x is Record<string, any>}
 */
function isObj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/**
 * v0 노드: id = name. 나머지 키는 그대로 둔다(알 수 없는 키는 validate가 잡는다).
 * @param {unknown} n
 * @returns {unknown}
 */
function convertNode(n) {
  if (!isObj(n)) return n;
  return { ...n, id: n.name };
}

/**
 * v0 엣지: sign '−'→'-', ev→evidence, 빠진 필드 기본값 채움.
 * cond/lag/strength는 없으면 생략한다.
 * @param {unknown} e
 * @returns {unknown}
 */
function convertEdge(e) {
  if (!isObj(e)) return e;
  const { ev, ...rest } = e;
  /** @type {Record<string, any>} */
  const out = { ...rest };
  if (typeof out.sign === 'string') out.sign = out.sign.replace(/\u2212/g, '-');
  if (out.note === undefined) out.note = '';
  if (out.status === undefined) out.status = 'open';
  if (out.r === undefined) out.r = null;
  if (out.rsrc === undefined) out.rsrc = '';
  out.evidence = ev !== undefined ? parseEvidence(ev) : (Array.isArray(e.evidence) ? e.evidence.slice() : []);
  return out;
}

/**
 * v0 → v1 변환.
 * @param {Record<string, any>} obj  schemaVersion 없는 원본
 * @returns {GraphData}
 */
function migrateV0(obj) {
  const nodes = Array.isArray(obj.nodes) ? obj.nodes.map(convertNode) : [];
  const edges = Array.isArray(obj.edges) ? obj.edges.map(convertEdge) : [];
  const cors = Array.isArray(obj.cors) ? obj.cors.map((c) => (isObj(c) ? { ...c } : c)) : [];

  /** @type {Record<string, number>} */
  const levels = {};
  for (const e of edges) {
    if (isObj(e) && typeof e.level === 'string') levels[e.level] = (levels[e.level] ?? 0) + 1;
  }
  const meta = isObj(obj.meta)
    ? { ...obj.meta }
    : { version: 'v0', generated: '', nodes: nodes.length, edges: edges.length, levels };

  return /** @type {GraphData} */ (/** @type {unknown} */ ({
    schemaVersion: SCHEMA_VERSION,
    meta,
    nodes,
    edges,
    cors,
  }));
}

/**
 * graph.json 원본을 v1 GraphData로 바꾼다.
 * - schemaVersion 없음 → v0로 보고 변환(새 객체 반환).
 * - schemaVersion === 1 → 그대로 반환(같은 객체).
 * - 그 밖(예: 99) → Error('unsupported schemaVersion N') throw.
 * @param {unknown} raw
 * @returns {GraphData}
 */
export function migrate(raw) {
  if (!isObj(raw)) throw new TypeError('graph data must be an object');
  const v = raw.schemaVersion;
  if (v === undefined || v === null) return migrateV0(raw);
  if (v === SCHEMA_VERSION) return /** @type {GraphData} */ (/** @type {unknown} */ (raw));
  throw new Error(`unsupported schemaVersion ${String(v)}`);
}
