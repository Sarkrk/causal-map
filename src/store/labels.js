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
  Real_Economy: '#d4a55a',
  Inflation_Labor: '#d7717d',
  Policy: '#8dbb74',
  Financial_Market: '#6f9fd6',
  External_Sector: '#3fa7a0',
  Industry_AI: '#d98ab0',
  Labor_Demographics: '#dd8a5a',
  Institutions: '#9aa6b5',
  Environment: '#5eb98a',
  Fiscal: '#cfc360',
  Money_Credit: '#9cc3dc',
  Trade_Global: '#4f86c6',
  Other: '#868b94',
};

/** 등급 → 색 (원본 GC). */
export const GC = { A: '#e5646a', B: '#6b9be8', C: '#7a7a7a', D: '#9a9a9a' };

/** @type {string[]} 범주 키 전체 순서 */
export const CATEGORY_ORDER = Object.keys(CN);

/** @type {string[]} 등급 전체 */
export const LEVELS = ['A', 'B', 'C', 'D'];

/**
 * 엣지 표시 등급. DB level은 A~D 그대로 두고, B만 sub('+'|'-')로 B+/B-로 나눠 쓴다.
 * sub가 없거나 B가 아니면 level을 그대로 돌려준다.
 * @param {string} level
 * @param {string|null|undefined} [sub]
 * @returns {string}
 */
export function levelText(level, sub) {
  return level === 'B' && (sub === '+' || sub === '-') ? 'B' + sub : level;
}

/**
 * 등급 배지 색. B-는 같은 B색을 조금 흐리게 쓴다(색상은 그대로, 알파만 낮춤).
 * @param {string} level
 * @param {string|null|undefined} [sub]
 * @param {number} [alpha] 알파(0~255, 기본 255)
 * @returns {string}
 */
export function levelColor(level, sub, alpha = 0xff) {
  const c = GC[/** @type {'A'} */ (level)] || GC.C;
  const a = level === 'B' && sub === '-' ? Math.round(alpha * 0.72) : alpha;
  return a === 0xff ? c : c + a.toString(16).padStart(2, '0');
}

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
