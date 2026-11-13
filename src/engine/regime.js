// @ts-check
// 국면(regime) 규칙: 어떤 엣지가 활성인지 결정하는 순수 함수.

/** @typedef {import('../types.js').EdgeFilter} EdgeFilter */

/**
 * 국면 필터를 만든다. activeRegime이 null/undefined면 '평시 가정'이라 regime이 null 또는 'normal'인
 * 엣지만 활성. 그 밖의 값(예: 'stress')이면 regime이 null이거나 그 값과 같은 엣지만 활성.
 * regime=null 엣지는 어떤 국면에서도 상시 활성이다.
 * @param {string|null|undefined} activeRegime
 * @returns {EdgeFilter}
 */
export function regimeFilter(activeRegime) {
  const active = activeRegime ?? 'normal';
  return (e) => {
    const r = e.regime ?? null;
    return r === null || r === active;
  };
}
