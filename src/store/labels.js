// @ts-check
// 화면 표시 상수. 값·문구는 원본 app.js의 CN·CC·GC와 동일하다.

/** 범주 → 한글 이름 (원본 CN). 키 순서가 범주 배치 순서가 된다. */
export const CN = {
  Real_Economy: '실물경제',
  Inflation_Labor: '물가·고용',
  Policy: '정책·규제',
  Financial_Market: '금융·자산',
  External_Sector: '대외부문',
  Industry_AI: '산업·AI',
  Labor_Demographics: '노동·인구',
  Institutions: '제도·거버넌스',
  Environment: '환경·자원',
  Fiscal: '재정',
  Money_Credit: '화폐·신용',
  Trade_Global: '무역·글로벌',
  Other: '기타',
};

/** 범주 → 색 (원본 CC). */
export const CC = {
  Real_Economy: '#e0af68',
  Inflation_Labor: '#f7768e',
  Policy: '#9ece6a',
  Financial_Market: '#7aa2f7',
  External_Sector: '#2ac3de',
  Industry_AI: '#bb9af7',
  Labor_Demographics: '#fb923c',
  Institutions: '#818cf8',
  Environment: '#4ade80',
  Fiscal: '#fde047',
  Money_Credit: '#22d3ee',
  Trade_Global: '#60a5fa',
  Other: '#a9b1d6',
};

/** 등급 → 색 (원본 GC). */
export const GC = { A: '#e5484d', B: '#5b8def', C: '#6f6f6f', D: '#9a9a9a' };

/** @type {string[]} 범주 키 전체 순서 */
export const CATEGORY_ORDER = Object.keys(CN);

/** @type {string[]} 등급 전체 */
export const LEVELS = ['A', 'B', 'C', 'D'];

/** 방향 토글 버튼 라벨 (순환 순서: both → up → down). */
export const DIR_BTN = { both: '양쪽 ⇄', up: '원인만 ←', down: '결과만 →' };

/** 방향 표시 문구(항목 요약용). */
export const DIR_TEXT = { both: '양쪽', up: '원인만', down: '결과만' };

/**
 * 데이터에 실제로 있는 범주만, CN 순서대로. 원본 CK와 같다.
 * @param {{nodes: {cat: string}[]}} g
 * @returns {string[]}
 */
export function categoriesPresent(g) {
  return CATEGORY_ORDER.filter((k) => g.nodes.some((n) => n.cat === k));
}
