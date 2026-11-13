// @ts-check
// 스키마 v2 런타임 상수(순수). 타입은 types.js에 있다.

/** @typedef {import('../types.js').Lag} Lag */
/** @typedef {import('../types.js').Level} Level */

/** lag 허용 값(graph.schema.json과 일치해야 한다). */
export const LAGS = /** @type {Lag[]} */ (['immediate', 'short', 'medium', 'long']);

/** 대표 시차(개월). 누적 시차 계산용. lag가 null이면 미상으로 따로 센다. */
export const LAG_MONTHS = /** @type {Record<Lag, number>} */ ({ immediate: 0, short: 2, medium: 7, long: 18 });

/** 등급별 가중치. 경로 신뢰도 = 엣지 가중치의 곱. */
export const LEVEL_WEIGHT = /** @type {Record<Level, number>} */ ({ A: 1, B: 0.75, C: 0.5, D: 0.25 });

/** regime 정규 어휘. 이 밖의 문자열은 validate가 warning. */
export const REGIMES = ['normal', 'stress', 'tightening', 'easing', 'recession', 'expansion'];
