// @ts-check
// 고정 시드 난수. Math.random 대신 쓴다(같은 시드 → 같은 배치).
// DOM 없는 순수 모듈.

/**
 * mulberry32: 32비트 상태의 작은 결정적 난수 생성기. 반환값은 [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a 32비트 문자열 해시. 노드 id → 정수.
 * @param {string} s
 * @returns {number} 부호 없는 32비트 정수
 */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 노드 하나의 초기 위치 난수. 시드와 노드 id에서만 정해지므로, 다른 노드가 추가·삭제돼도 값이 바뀌지 않는다.
 * @param {number} seed
 * @param {string} id
 * @returns {() => number}
 */
export function nodeRng(seed, id) {
  return mulberry32((hashString(id) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0);
}

/**
 * 다시 배치용 새 시드. 이전 시드에서 결정적으로 이어진다(누를 때마다 값이 바뀐다).
 * @param {number} seed
 * @returns {number} 부호 없는 32비트 정수
 */
export function nextSeed(seed) {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}
