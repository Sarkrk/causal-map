// @ts-check
// graph.schema.json(v2) 규칙을 코드로 옮긴 검증기 + 참조 무결성 검사.
// JSON 스키마 파일은 import하지 않는다(enum·키 목록은 아래 상수로 둔다).

import { LAGS, REGIMES } from './v2.js';

/** @typedef {import('../types.js').GraphData} GraphData */

const TOP_KEYS = ['schemaVersion', 'meta', 'nodes', 'edges', 'cors'];
const META_REQUIRED = ['version', 'generated', 'nodes', 'edges', 'levels'];
const CATS = ['Real_Economy', 'Inflation_Labor', 'Policy', 'Financial_Market', 'External_Sector', 'Industry_AI', 'Other'];
const SIGNS = ['+', '-', '±'];
const LEVELS = ['A', 'B', 'C', 'D'];
const NODE_REQUIRED = ['id', 'name', 'cat'];
const NODE_KEYS = ['id', 'name', 'cat', 'layer', 'series', 'desc', 'descSrc', 'aka'];
const DESC_MAX = 240;
const DESC_SRC_MAX = 120;
const AKA_MAX_N = 12;
const AKA_MAX_LEN = 40;
const EDGE_REQUIRED = ['id', 'src', 'dst', 'sign', 'level', 'status', 'note', 'r', 'rsrc', 'evidence'];
const EDGE_KEYS = [...EDGE_REQUIRED, 'cond', 'lag', 'regime', 'strength'];
const EVIDENCE_KEYS = ['kind', 'stance'];
const COR_REQUIRED = ['src', 'dst', 'r'];

/**
 * @param {unknown} x
 * @returns {x is Record<string, any>}
 */
function isObj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/**
 * @param {unknown} x
 * @returns {boolean} 비어 있지 않은 문자열인지
 */
function nonEmptyStr(x) {
  return typeof x === 'string' && x.length > 0;
}

/**
 * @param {unknown} x
 * @returns {boolean} 유한한 숫자인지
 */
function finiteNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * 객체에 허용되지 않은 키가 있으면 오류를 쌓는다.
 * @param {Record<string, any>} obj
 * @param {string[]} allowed
 * @param {string} label
 * @param {string[]} errors
 * @returns {void}
 */
function checkUnknownKeys(obj, allowed, label, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) errors.push(`${label}: unknown key "${k}"`);
  }
}

/**
 * @param {Record<string, any>} obj
 * @param {string[]} keys
 * @param {string} label
 * @param {string[]} errors
 * @returns {void}
 */
function checkRequired(obj, keys, label, errors) {
  for (const k of keys) {
    if (!(k in obj) || obj[k] === undefined) errors.push(`${label}: missing "${k}"`);
  }
}

/**
 * sign 값 오류 메시지(유니코드 마이너스는 힌트를 붙인다).
 * @param {unknown} s
 * @returns {string}
 */
function signHint(s) {
  return s === '\u2212' ? ' (use ASCII "-")' : '';
}

/**
 * meta 블록 검사.
 * @param {unknown} meta
 * @param {string[]} errors
 * @returns {void}
 */
function checkMeta(meta, errors) {
  if (meta === undefined) return;
  if (!isObj(meta)) {
    errors.push('meta: must be an object');
    return;
  }
  checkRequired(meta, META_REQUIRED, 'meta', errors);
  if ('version' in meta && !nonEmptyStr(meta.version)) errors.push('meta.version: must be a non-empty string');
  if ('generated' in meta && typeof meta.generated !== 'string') errors.push('meta.generated: must be a string');
  for (const k of ['nodes', 'edges']) {
    if (k in meta && !(Number.isInteger(meta[k]) && meta[k] >= 0)) errors.push(`meta.${k}: must be a non-negative integer`);
  }
  if ('levels' in meta) {
    if (!isObj(meta.levels)) errors.push('meta.levels: must be an object');
    else {
      for (const [k, v] of Object.entries(meta.levels)) {
        if (!Number.isInteger(v)) errors.push(`meta.levels.${k}: must be an integer`);
      }
    }
  }
}

/**
 * 노드 선택 키 desc·descSrc·aka 검사(null·생략 허용).
 * @param {Record<string, any>} n
 * @param {string} label
 * @param {string[]} errors
 * @returns {void}
 */
function checkNodeDesc(n, label, errors) {
  for (const [k, max] of /** @type {[string, number][]} */ ([['desc', DESC_MAX], ['descSrc', DESC_SRC_MAX]])) {
    const v = n[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') errors.push(`${label}: ${k} must be a string or null`);
    else if (v.length < 1 || v.length > max) errors.push(`${label}: ${k} length must be 1~${max}`);
  }
  const a = n.aka;
  if (a === undefined || a === null) return;
  if (!Array.isArray(a)) {
    errors.push(`${label}: aka must be an array or null`);
    return;
  }
  if (a.length > AKA_MAX_N) errors.push(`${label}: aka must have at most ${AKA_MAX_N} items`);
  /** @type {Set<string>} */
  const seen = new Set();
  a.forEach((x, j) => {
    if (typeof x !== 'string') errors.push(`${label}: aka[${j}] must be a string`);
    else if (x.length < 1 || x.length > AKA_MAX_LEN) errors.push(`${label}: aka[${j}] length must be 1~${AKA_MAX_LEN}`);
    else if (seen.has(x)) errors.push(`${label}: aka[${j}] duplicate "${x}"`);
    else seen.add(x);
  });
}

/**
 * 노드 배열 검사. 유효한 노드 id 집합을 반환한다.
 * @param {unknown} nodes
 * @param {string[]} errors
 * @returns {Set<string>}
 */
function checkNodes(nodes, errors) {
  /** @type {Set<string>} */
  const ids = new Set();
  if (!Array.isArray(nodes)) {
    errors.push('nodes: must be an array');
    return ids;
  }
  nodes.forEach((n, i) => {
    if (!isObj(n)) {
      errors.push(`node #${i}: must be an object`);
      return;
    }
    const label = nonEmptyStr(n.id) ? `node "${n.id}"` : `node #${i}`;
    checkUnknownKeys(n, NODE_KEYS, label, errors);
    checkRequired(n, NODE_REQUIRED, label, errors);
    if ('id' in n && !nonEmptyStr(n.id)) errors.push(`${label}: id must be a non-empty string`);
    if ('name' in n && !nonEmptyStr(n.name)) errors.push(`${label}: name must be a non-empty string`);
    if ('cat' in n && !CATS.includes(n.cat)) errors.push(`${label}: cat "${String(n.cat)}" invalid`);
    if ('layer' in n && n.layer !== null && !Number.isInteger(n.layer)) errors.push(`${label}: layer must be integer or null`);
    if ('series' in n && n.series !== null && typeof n.series !== 'string') errors.push(`${label}: series must be string or null`);
    checkNodeDesc(n, label, errors);
    if (nonEmptyStr(n.id)) {
      if (ids.has(n.id)) errors.push(`duplicate node id "${n.id}"`);
      ids.add(n.id);
    }
    if (nonEmptyStr(n.id) && nonEmptyStr(n.name) && n.id !== n.name) {
      errors.push(`${label}: id must equal name (v1)`);
    }
  });
  return ids;
}

/**
 * evidence 배열 검사.
 * @param {unknown} ev
 * @param {string} label
 * @param {string[]} errors
 * @returns {void}
 */
function checkEvidence(ev, label, errors) {
  if (!Array.isArray(ev)) {
    errors.push(`${label}: evidence must be an array`);
    return;
  }
  ev.forEach((x, j) => {
    if (!isObj(x)) {
      errors.push(`${label}: evidence[${j}] must be an object`);
      return;
    }
    checkUnknownKeys(x, EVIDENCE_KEYS, `${label}: evidence[${j}]`, errors);
    checkRequired(x, EVIDENCE_KEYS, `${label}: evidence[${j}]`, errors);
    if ('kind' in x && typeof x.kind !== 'string') errors.push(`${label}: evidence[${j}].kind must be a string`);
    if ('stance' in x && typeof x.stance !== 'string') errors.push(`${label}: evidence[${j}].stance must be a string`);
  });
}

/**
 * 엣지 배열 검사(필드·enum·참조 무결성·자기루프·중복). 어휘 밖 regime은 warnings.
 * @param {unknown} edges
 * @param {Set<string>} nodeIds
 * @param {string[]} errors
 * @param {string[]} warnings
 * @returns {void}
 */
function checkEdges(edges, nodeIds, errors, warnings) {
  if (!Array.isArray(edges)) {
    errors.push('edges: must be an array');
    return;
  }
  /** @type {Map<string,string>} */
  const edgeIds = new Map();
  /** @type {Map<string,string>} */
  const pairs = new Map();
  edges.forEach((e, i) => {
    if (!isObj(e)) {
      errors.push(`edge #${i}: must be an object`);
      return;
    }
    const label = nonEmptyStr(e.id) ? `edge ${e.id}` : `edge #${i}`;
    checkUnknownKeys(e, EDGE_KEYS, label, errors);
    checkRequired(e, EDGE_REQUIRED, label, errors);
    if ('id' in e && !nonEmptyStr(e.id)) errors.push(`${label}: id must be a non-empty string`);
    if (nonEmptyStr(e.id)) {
      if (edgeIds.has(e.id)) errors.push(`duplicate edge id "${e.id}"`);
      edgeIds.set(e.id, label);
    }
    if ('sign' in e && !SIGNS.includes(e.sign)) errors.push(`${label}: sign "${String(e.sign)}" invalid${signHint(e.sign)}`);
    if ('level' in e && !LEVELS.includes(e.level)) errors.push(`${label}: level "${String(e.level)}" invalid`);
    if ('status' in e && typeof e.status !== 'string') errors.push(`${label}: status must be a string`);
    if ('note' in e && typeof e.note !== 'string') errors.push(`${label}: note must be a string`);
    if ('rsrc' in e && typeof e.rsrc !== 'string') errors.push(`${label}: rsrc must be a string`);
    if ('r' in e && e.r !== null && !finiteNum(e.r)) errors.push(`${label}: r must be a number or null`);
    for (const k of ['cond', 'strength']) {
      if (k in e && e[k] !== null && e[k] !== undefined && typeof e[k] !== 'string') {
        errors.push(`${label}: ${k} must be a string or null`);
      }
    }
    if ('lag' in e && e.lag !== null && e.lag !== undefined && !LAGS.includes(e.lag)) {
      errors.push(`${label}: lag "${String(e.lag)}" invalid (use ${LAGS.join('|')} or null)`);
    }
    if ('regime' in e && e.regime !== null && e.regime !== undefined) {
      if (typeof e.regime !== 'string') errors.push(`${label}: regime must be a string or null`);
      else if (!REGIMES.includes(e.regime)) warnings.push(`${label}: regime "${e.regime}" not in vocabulary (${REGIMES.join('|')})`);
    }
    if ('evidence' in e) checkEvidence(e.evidence, label, errors);

    const srcOk = nonEmptyStr(e.src);
    const dstOk = nonEmptyStr(e.dst);
    if ('src' in e && !srcOk) errors.push(`${label}: src must be a non-empty string`);
    if ('dst' in e && !dstOk) errors.push(`${label}: dst must be a non-empty string`);
    if (srcOk && !nodeIds.has(e.src)) errors.push(`${label}: src "${e.src}" not found`);
    if (dstOk && !nodeIds.has(e.dst)) errors.push(`${label}: dst "${e.dst}" not found`);
    if (srcOk && dstOk) {
      if (e.src === e.dst) {
        errors.push(`${label}: self-loop (src = dst "${e.src}")`);
      } else {
        const key = JSON.stringify([e.src, e.dst]);
        const first = pairs.get(key);
        if (first !== undefined) errors.push(`${label}: duplicate pair "${e.src}"→"${e.dst}" (same as ${first})`);
        else pairs.set(key, label);
      }
    }
  });
}

/**
 * 코르 배열 검사. 참조 누락은 오류가 아니라 warnings로 보고한다.
 * @param {unknown} cors
 * @param {Set<string>} nodeIds
 * @param {string[]} errors
 * @param {string[]} warnings
 * @returns {void}
 */
function checkCors(cors, nodeIds, errors, warnings) {
  if (!Array.isArray(cors)) {
    errors.push('cors: must be an array');
    return;
  }
  cors.forEach((c, i) => {
    if (!isObj(c)) {
      errors.push(`cor #${i}: must be an object`);
      return;
    }
    const label = `cor #${i}`;
    checkRequired(c, COR_REQUIRED, label, errors);
    if ('src' in c && typeof c.src !== 'string') errors.push(`${label}: src must be a string`);
    if ('dst' in c && typeof c.dst !== 'string') errors.push(`${label}: dst must be a string`);
    if ('r' in c && !finiteNum(c.r)) errors.push(`${label}: r must be a number`);
    if ('n' in c && c.n !== null && c.n !== undefined && !Number.isInteger(c.n)) errors.push(`${label}: n must be integer or null`);
    if (typeof c.src === 'string' && !nodeIds.has(c.src)) warnings.push(`cor #${i}: src "${c.src}" not in nodes`);
    if (typeof c.dst === 'string' && !nodeIds.has(c.dst)) warnings.push(`cor #${i}: dst "${c.dst}" not in nodes`);
  });
}

/**
 * graph.json v2 객체를 검증한다. 입력은 변경하지 않는다.
 * @param {unknown} g
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}  ok는 errors가 비었을 때 true. warnings는 ok에 영향 없음.
 */
export function validateGraph(g) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  if (!isObj(g)) {
    return { ok: false, errors: ['root: must be an object'], warnings };
  }
  checkUnknownKeys(g, TOP_KEYS, 'top-level', errors);
  checkRequired(g, TOP_KEYS, 'top-level', errors);
  if ('schemaVersion' in g && g.schemaVersion === 1) {
    errors.push('schemaVersion 1 (v1) data: run migrate() first, then validate');
  } else if ('schemaVersion' in g && g.schemaVersion !== 2) {
    errors.push(`schemaVersion must be 2 (got ${JSON.stringify(g.schemaVersion)})`);
  }
  checkMeta(g.meta, errors);
  const nodeIds = checkNodes(g.nodes, errors);
  checkEdges(g.edges, nodeIds, errors, warnings);
  checkCors(g.cors, nodeIds, errors, warnings);

  if (Array.isArray(g.nodes) && Array.isArray(g.edges)) {
    /** @type {Set<string>} */
    const linked = new Set();
    for (const e of g.edges) {
      if (isObj(e)) {
        if (typeof e.src === 'string') linked.add(e.src);
        if (typeof e.dst === 'string') linked.add(e.dst);
      }
    }
    for (const id of nodeIds) {
      if (!linked.has(id)) warnings.push(`node "${id}": isolated (no edges)`);
    }
    if (isObj(g.meta)) {
      if (Number.isInteger(g.meta.nodes) && g.meta.nodes !== g.nodes.length) {
        warnings.push(`meta.nodes (${g.meta.nodes}) != nodes.length (${g.nodes.length})`);
      }
      if (Number.isInteger(g.meta.edges) && g.meta.edges !== g.edges.length) {
        warnings.push(`meta.edges (${g.meta.edges}) != edges.length (${g.edges.length})`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
