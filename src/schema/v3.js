// @ts-check
// 스키마 v3 런타임 상수·가중치 헬퍼(순수). v2 상수를 재수출한다.
import { LAGS, LAG_MONTHS, LEVEL_WEIGHT, REGIMES } from './v2.js';

export { LAGS, LAG_MONTHS, LEVEL_WEIGHT, REGIMES };

/** @typedef {import('../types.js').Tier} Tier */
/** @typedef {import('../types.js').EdgeFlag} EdgeFlag */
/** @typedef {import('../types.js').EdgeData} EdgeData */

/** 노드 티어 정규 어휘(core=실전 시장 핵심, bridge=핵심 1-hop 연결, econ=교과서·배경 지식). */
export const TIERS = /** @type {Tier[]} */ (['core', 'bridge', 'econ']);

/** 엣지 구조 경고 플래그 정규 어휘. */
export const EDGE_FLAGS = /** @type {EdgeFlag[]} */ (['reverse-lead', 'confounded', 'regime-flip', 'sign-mismatch']);

/** 세분화된 엣지 가중치(B+ / B- 차등, sub 없는 B는 하위호환 0.75). */
export const EDGE_WEIGHT = /** @type {Record<string, number>} */ ({
  A: 1.0,
  'B+': 0.85,
  B: 0.75,
  'B-': 0.55,
  C: 0.5,
  D: 0.25,
});

/** 구조 경고(교란·실증부호 불일치) 엣지 감쇠 계수(백엔드 causal_propagate 규약 0.7과 동일). */
export const FLAG_DISCOUNT = 0.7;

/**
 * 엣지 단일 가중치. B는 sub('+'|'-')가 있으면 차등 가중치를 적용하고,
 * confounded 또는 sign-mismatch 플래그가 있으면 0.7 감쇠한다.
 * @param {Pick<EdgeData, 'level'|'sub'|'flags'>} e
 * @returns {number}
 */
export function edgeWeight(e) {
  const key = e.level === 'B' && (e.sub === '+' || e.sub === '-') ? `B${e.sub}` : e.level;
  let w = EDGE_WEIGHT[key] ?? LEVEL_WEIGHT.D;
  if (Array.isArray(e.flags) && (e.flags.includes('confounded') || e.flags.includes('sign-mismatch'))) {
    w *= FLAG_DISCOUNT;
  }
  return w;
}
