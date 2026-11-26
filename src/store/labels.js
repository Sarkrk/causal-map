// @ts-check
// 화면 표시 상수. 구심점 섹터(11/23)만 쓴다. 옛 '범주(cat)' 색·이름은 11/25 제거됐다.

/** 등급 → 색 (라이트 테마 고대비·저채도). */
export const GC = { A: '#d93848', B: '#2b6cb0', C: '#6b7684', D: '#8b95a1' };

/** 섹터(구심점) → 한글 이름. 11/23 사용자 지시: 섹터별 구심점 구조. 키 순서가 배치 순서. */
export const SN = {
  macro: '거시경제',
  finance: '금융·시장',
  semi: '반도체·AI',
  bio: '바이오',
  energy: '에너지·환경',
  trade: '무역·지정학',
  policy: '제도·정책',
  labor: '노동·인구',
  other: '이론·기타',
};

/** 섹터 → 색(절제된 핀테크·에디토리얼 톤, 작은 색 점·배지용). */
export const SECC = {
  macro: '#b7791f',
  finance: '#2563eb',
  semi: '#6d4aff',
  bio: '#168a53',
  energy: '#0d8a7b',
  trade: '#3b5bdb',
  policy: '#5a6778',
  labor: '#c95b2b',
  other: '#76818e',
};

/** @type {string[]} 섹터 키 전체 순서 */
export const SECTOR_ORDER = Object.keys(SN);

/**
 * 데이터에 실제로 있는 섹터만, SN 순서대로. sector가 없는 노드는 'other'로 본다.
 * @param {{nodes: {sector?: string|null}[]}} g
 * @returns {string[]}
 */
export function sectorsPresent(g) {
  return SECTOR_ORDER.filter((k) => g.nodes.some((n) => (n.sector || 'other') === k));
}

/** @type {string[]} 범주 키 전체 순서는 없앴다(11/25). 섹터 키 순서는 SECTOR_ORDER. */

/** 등급 칩 문구. */
export const LEVEL_TEXT = { A: 'A 확실', B: 'B 유력', C: 'C 후보', D: 'D 논쟁' };

/** @type {string[]} 등급 전체 */
export const LEVELS = ['A', 'B', 'C', 'D'];

/** 노드 티어 순서(v3). */
export const TIER_ORDER = /** @type {const} */ (['core', 'bridge', 'econ']);

/** 티어 → 한글 라벨. */
export const TIER_TEXT = /** @type {Record<string, string>} */ ({
  core: '핵심 시장',
  bridge: '연결 개념',
  econ: '이론·배경',
});

/** 티어 → 배지 색. */
export const TIER_COLOR = /** @type {Record<string, string>} */ ({
  core: '#d93848',
  bridge: '#2563eb',
  econ: '#6b7684',
});

/** 엣지 구조 경고 플래그 → 배지 문구. */
export const FLAG_TEXT = /** @type {Record<string, string>} */ ({
  confounded: '공통원인 의심',
  'reverse-lead': '역방향 선행',
  'sign-mismatch': '실증부호 불일치',
  'regime-flip': '최근 전환',
});

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
