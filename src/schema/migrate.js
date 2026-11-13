// @ts-check
// graph.json 마이그레이션: v0(구 형식, schemaVersion 없음) → v1 → v2. 입력 객체는 변경하지 않는다.

import { LAGS, REGIMES } from './v2.js';

/** @typedef {import('../types.js').GraphData} GraphData */
/** @typedef {import('../types.js').Lag} Lag */

export const SCHEMA_VERSION = 2;
const V1 = 1;

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
  if (typeof out.sign === 'string') out.sign = out.sign.replace(/−/g, '-');
  if (out.note === undefined) out.note = '';
  if (out.status === undefined) out.status = 'open';
  if (out.r === undefined) out.r = null;
  if (out.rsrc === undefined) out.rsrc = '';
  out.evidence = ev !== undefined ? parseEvidence(ev) : (Array.isArray(e.evidence) ? e.evidence.slice() : []);
  return out;
}

/**
 * v0 → v1 변환(schemaVersion 1인 중간 객체).
 * @param {Record<string, any>} obj  schemaVersion 없는 원본
 * @returns {Record<string, any>}
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

  return { schemaVersion: V1, meta, nodes, edges, cors };
}

// ---- v1 → v2: lag·regime 자동 파싱 ----

/**
 * 후보 집합이 정확히 한 종류일 때만 그 값, 없거나 충돌하면 null.
 * @template T
 * @param {Set<T>} s
 * @returns {T|null}
 */
function onlyOne(s) {
  return s.size === 1 ? [...s][0] : null;
}

/**
 * 개월 수 → Lag. N≤1 immediate, ≤3 short, ≤12 medium, 그 위 long.
 * @param {number} m
 * @returns {Lag}
 */
function monthsToLag(m) {
  if (m <= 1) return 'immediate';
  if (m <= 3) return 'short';
  if (m <= 12) return 'medium';
  return 'long';
}

// 숫자+단위. 뒤에 붙는 말로 '10년물·5년 BEI·3개월 평균' 같은 만기/평균 표기는 거른다(시차가 아님).
const NUM_UNIT = /(\d+(?:\.\d+)?)(?:\s*[~∼-]\s*(\d+(?:\.\d+)?))?\s*(개월|분기|년)(?!\s*(?:물|만기|금리|국채|BEI|평균|이동|누적|수익률|이후|이전|대비|간|말|초|전|래|치|기준|동안|연속|구간|단위))/g;
// 숫자는 시차 단서어가 같은 구절(앞뒤 8자)에 있을 때만 시차로 본다('30년 고정 모기지', '6개월 패널'은 시차가 아님).
const LAG_CUE = /선행|후행|시차|지연|래그|lag|걸려|걸린|소요|뒤|후에|이내|파급|전가|반영|시차|뒤늦/i;
const CUE_SPAN = 8;
const IMMEDIATE_KW = /즉시|당일|동행|같은\s*달/;
// '단기금리·장기물·장기 JGB'처럼 기간 라벨이 아니라 자산/개념 이름의 일부인 경우는 제외한다.
const NOUNISH = '(?:금리|물|채|국채|채권|기대|BEI|JGB|CDS|\\(|부채|차입|자금|예금|변동|투자|유동|CP|외채|조달|계약|전망|평균|추세|성장|지속|보유|실업|임대|이자|가격|스프레드|프리미엄|균형|중립|과거|구조|저축|인플레|기조|재정|목표)';
const SHORT_KW = new RegExp(`단기(?!\\s*${NOUNISH})`);
const MID_KW = new RegExp(`중기(?!\\s*${NOUNISH})`);
const LONG_KW = new RegExp(`장기(?!\\s*${NOUNISH})`);

/**
 * 한국어 설명 문장에서 시차 분류를 뽑는다. 단서가 없거나 서로 다른 값이 충돌하면 null.
 * 예: '즉시'→immediate, '3개월'→short, '약 4분기'→medium, '2년'→long, '단기'→short.
 * 이미 enum 값('short' 등)이면 그대로 돌려준다.
 * @param {unknown} text
 * @returns {Lag|null}
 */
export function parseLag(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (t === '') return null;
  if (LAGS.includes(/** @type {Lag} */ (t))) return /** @type {Lag} */ (t);
  /** @type {Set<Lag>} */
  const found = new Set();
  // 4자리+년('2026년', '2015년 이후')은 날짜이므로 먼저 지운다.
  const s = t.replace(/\d{4}\s*년/g, ' ').replace(/(?:단기|중기|장기)\([^)]*\)/g, ' ');
  for (const m of s.matchAll(NUM_UNIT)) {
    const i = m.index ?? 0;
    if (!LAG_CUE.test(s.slice(Math.max(0, i - CUE_SPAN), i + m[0].length + CUE_SPAN))) continue;
    const unit = m[3];
    for (const raw of [m[1], m[2]]) {
      if (raw === undefined) continue;
      const n = Number(raw);
      if (unit === '년') found.add('long');
      else found.add(monthsToLag(unit === '분기' ? n * 3 : n));
    }
  }
  if (IMMEDIATE_KW.test(s)) found.add('immediate');
  if (SHORT_KW.test(s)) found.add('short');
  if (MID_KW.test(s)) found.add('medium');
  if (LONG_KW.test(s)) found.add('long');
  return onlyOne(found);
}

// 국면 단어는 '위기 시·긴축 국면·인상기'처럼 국면을 가리키는 접미가 붙을 때만 인정한다
// ('긴축경로 기대'는 노드명, '규제완화 기대'·'변동성 완화'는 국면이 아님).
const SUF = '(?:\\s*(?:국면|구간|환경|시기|기간|하에서|중|때)|\\s*시(?![가-힣])|\\s*주(?![가-힣])|기(?:에는|에서|에|엔|의|는|(?![가-힣])))';
/** @type {[string, RegExp][]} */
const REGIME_KW = [
  ['normal', /평시/],
  ['stress', new RegExp(`꼬리위험|급변|(?:위기|패닉|쇼크)${SUF}`)],
  ['tightening', new RegExp(`(?:긴축|인상)${SUF}`)],
  ['easing', new RegExp(`(?<!규제\\s?)(?<!한도\\s?)(?<!변동성\\s?)(?<!쏠림\\s?)(?<!가격\\s?)(?<!\\()(?:완화|인하)${SUF}`)],
  ['recession', new RegExp(`(?<!부동산\\s?)(?<!주택\\s?)침체${SUF}`)],
  ['expansion', new RegExp(`(?:확장|호황)${SUF}`)],
];

/**
 * 문장에서 활성 국면(정규 어휘)을 뽑는다. 단서가 없거나 서로 다른 국면이 둘 이상이면 null
 * (후자는 'A 시 +, B 시 −'처럼 엣지를 국면별로 쪼개야 하는 경우).
 * @param {unknown} text
 * @returns {string|null}
 */
export function parseRegime(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const t = text.trim();
  if (REGIMES.includes(t)) return t;
  /** @type {Set<string>} */
  const found = new Set();
  // 규제·한도 얘기의 '완화/강화'는 통화 국면이 아니다.
  const regulatory = /규제|한도/.test(t);
  for (const [name, re] of REGIME_KW) {
    if (regulatory && (name === 'easing' || name === 'tightening')) continue;
    if (re.test(t)) found.add(name);
  }
  return onlyOne(found);
}

/**
 * v1 → v2. 입력은 변경하지 않고 새 객체를 반환한다.
 * lag: 기존 lag 문자열 → note+cond 순으로 파싱. regime: 기존 regime → cond+note 파싱(없으면 null).
 * @param {Record<string, any>} v1
 * @returns {GraphData}
 */
export function migrateV1toV2(v1) {
  /** @param {unknown} x */
  const str = (x) => (typeof x === 'string' ? x : '');
  const edges = Array.isArray(v1.edges)
    ? v1.edges.map((/** @type {unknown} */ e) => {
        if (!isObj(e)) return e;
        // 기존 lag 필드 문장('약 2개월')은 그 자체가 시차 표기이므로 단서어를 붙여 파싱한다.
        const lag = parseLag(e.lag) ?? parseLag(`${str(e.lag)} 시차`) ?? parseLag(`${str(e.note)} | ${str(e.cond)}`);
        const regime = parseRegime(e.regime) ?? parseRegime(`${str(e.cond)} | ${str(e.note)}`);
        return { ...e, lag, regime };
      })
    : v1.edges;
  return /** @type {GraphData} */ (/** @type {unknown} */ ({
    ...v1,
    schemaVersion: SCHEMA_VERSION,
    meta: isObj(v1.meta) ? { ...v1.meta } : v1.meta,
    nodes: Array.isArray(v1.nodes) ? v1.nodes.map((/** @type {unknown} */ n) => (isObj(n) ? { ...n } : n)) : v1.nodes,
    edges,
    cors: Array.isArray(v1.cors) ? v1.cors.map((/** @type {unknown} */ c) => (isObj(c) ? { ...c } : c)) : v1.cors,
  }));
}

/**
 * graph.json 원본을 v2 GraphData로 바꾼다.
 * - schemaVersion 없음 → v0 → v1 → v2 (새 객체).
 * - schemaVersion 1 → v2 (새 객체).
 * - schemaVersion 2 → 그대로 반환(같은 객체).
 * - 그 밖(예: 99) → Error('unsupported schemaVersion N') throw.
 * @param {unknown} raw
 * @returns {GraphData}
 */
export function migrate(raw) {
  if (!isObj(raw)) throw new TypeError('graph data must be an object');
  const v = raw.schemaVersion;
  if (v === undefined || v === null) return migrateV1toV2(migrateV0(raw));
  if (v === V1) return migrateV1toV2(raw);
  if (v === SCHEMA_VERSION) return /** @type {GraphData} */ (/** @type {unknown} */ (raw));
  throw new Error(`unsupported schemaVersion ${String(v)}`);
}
