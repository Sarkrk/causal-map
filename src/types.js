// @ts-check
// 공유 타입 정의(JSDoc). 런타임 코드 없음. 다른 모듈은 `import './types.js'` 없이
// `/** @typedef {import('../types.js').Edge} Edge */` 형태로 참조한다.

/** @typedef {'Real_Economy'|'Inflation_Labor'|'Policy'|'Financial_Market'|'External_Sector'|'Industry_AI'|'Other'} Category */
/** @typedef {'+'|'-'|'±'} Sign   // 데이터는 ASCII '-'. 화면 표시는 '−'(U+2212). */
/** @typedef {'A'|'B'|'C'|'D'} Level */
/** @typedef {'immediate'|'short'|'medium'|'long'} Lag   immediate=1개월 미만, short=1~3개월, medium=3~12개월, long=12개월 초과 */
/** @typedef {string} Regime   정규 어휘는 schema/v2.js의 REGIMES. 어휘 밖 문자열은 validate가 warning. */

/**
 * @typedef {Object} NodeData
 * @property {string} id      안정 ID (v1에서는 name과 같음. 코드는 반드시 id로 참조)
 * @property {string} name    표시 이름
 * @property {Category} cat
 * @property {number|null} [layer]
 * @property {string|null} [series]
 */

/**
 * @typedef {Object} Evidence
 * @property {string} kind    '데이터'|'문헌'|'실적' 등
 * @property {string} stance  '지지'|'반박'|'부분' 등
 */

/**
 * @typedef {Object} EdgeData
 * @property {string} id
 * @property {string} src     NodeData.id
 * @property {string} dst     NodeData.id
 * @property {Sign} sign
 * @property {Level} level
 * @property {string} status  'open'|'contested'|'weak'…
 * @property {string} note
 * @property {string|null} [cond]
 * @property {Lag|null} [lag]          null/생략=미상
 * @property {Regime|null} [regime]   이 엣지가 활성인 국면. null/생략=상시
 * @property {string|null} [strength]
 * @property {number|null} r
 * @property {string} rsrc
 * @property {Evidence[]} evidence
 */

/** @typedef {{src:string,dst:string,r:number,n?:number|null}} CorData */

/**
 * @typedef {Object} GraphData   graph.json v2
 * @property {2} schemaVersion
 * @property {{version:string,generated:string,nodes:number,edges:number,levels:Object<string,number>}} meta
 * @property {NodeData[]} nodes
 * @property {EdgeData[]} edges
 * @property {CorData[]} cors
 */

/**
 * @typedef {Object} Graph       engine/graph.js createGraph() 결과 (불변으로 취급)
 * @property {NodeData[]} nodes
 * @property {EdgeData[]} edges
 * @property {CorData[]} cors
 * @property {Map<string,NodeData>} byId
 * @property {Map<string,EdgeData[]>} outE   id → 나가는 엣지(결과 방향)
 * @property {Map<string,EdgeData[]>} inE    id → 들어오는 엣지(원인 방향)
 * @property {Map<string,number>} deg       id → 인과 엣지 차수(in+out)
 */

/** @typedef {(e:EdgeData)=>boolean} EdgeFilter */
/** @typedef {'both'|'up'|'down'} Direction   up=상위 원인, down=하위 결과 */

/**
 * @typedef {Object} Loop
 * @property {string[]} nodes        시작 노드부터 순서대로(닫는 노드 반복 없음)
 * @property {EdgeData[]} edges
 * @property {'R'|'B'|'?'} polarity  R=강화(음 부호 짝수), B=균형(홀수), ?=±포함
 */

/**
 * @typedef {Object} Path
 * @property {string[]} nodes
 * @property {EdgeData[]} edges
 * @property {Sign} sign             부호 곱(± 하나라도 있으면 ±)
 */

// ---- Phase 2 계약용 타입(구현은 아직 없음) ----

/** @typedef {Path & {confidence:number, lagMonths:number, unknownLags:number, minLevel:Level}} ScoredPath */

/** @typedef {{activeRegime?:string|null, maxDepth?:number, edgeFilter?:EdgeFilter, topK?:number}} SimOptions */

/** @typedef {{id:string, score:number, sign:Sign, posMass:number, negMass:number, ambiguousMass:number, minLagMonths:number, depth:number}} SimImpact */

/** @typedef {{kind:'loop-R'|'loop-B'|'confounder'|'correlation-only', nodes:string[], edges?:string[], message:string}} SimWarning */

/** @typedef {{start:string, shockSign:1|-1, regime:string|null, impacts:SimImpact[], paths:ScoredPath[], warnings:SimWarning[]}} SimResult */

export {};
