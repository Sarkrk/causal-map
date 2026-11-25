// @ts-check
// 공유 타입 정의(JSDoc). 런타임 코드 없음. 다른 모듈은 `import './types.js'` 없이
// `/** @typedef {import('../types.js').Edge} Edge */` 형태로 참조한다.

/** @typedef {'+'|'-'|'±'} Sign   // 데이터는 ASCII '-'. 화면 표시는 '−'(U+2212). */
/** @typedef {'macro'|'finance'|'semi'|'bio'|'energy'|'trade'|'policy'|'labor'|'other'} Sector   // 구심점 섹터(11/23). 없으면 other 취급. */
/** @typedef {'A'|'B'|'C'|'D'} Level */
/** @typedef {'immediate'|'short'|'medium'|'long'} Lag   immediate=1개월 미만, short=1~3개월, medium=3~12개월, long=12개월 초과 */
/** @typedef {string} Regime   정규 어휘는 schema/v2.js의 REGIMES. 어휘 밖 문자열은 validate가 warning. */
/** @typedef {'core'|'bridge'|'econ'} Tier   노드 계층 티어(v3): core=시장 핵심, bridge=핵심 1-hop 연결, econ=이론·배경 */
/** @typedef {'reverse-lead'|'confounded'|'regime-flip'|'sign-mismatch'} EdgeFlag   구조 경고 플래그(v3) */

/**
 * 노드 최신 시장 상태(v3 선택). 공개 시세·거시 지표의 최근 변화와 5년 z-score.
 * @typedef {Object} NodeState
 * @property {number} z
 * @property {string} chg
 * @property {'21D'|'1M'|'1Q'} win
 * @property {string} asof
 * @property {boolean} fresh
 */

/**
 * 활성 시장 국면 요약(v3 meta.marketRegime).
 * @typedef {Object} MarketRegime
 * @property {Regime} code
 * @property {string} label
 * @property {string} asof
 */

/**
 * 엣지 경량 통계 요약(v3 선택).
 * @typedef {Object} EdgeStats
 * @property {number} [n]
 * @property {'D'|'W'|'M'|'Q'} [freq]
 * @property {boolean|null} [eraAgree]
 */

/**
 * @typedef {Object} NodeData
 * @property {string} id      안정 ID (v1에서는 name과 같음. 코드는 반드시 id로 참조)
 * @property {string} name    표시 이름
 * @property {Sector|null} [sector]   구심점 섹터(없으면 other 취급). 옛 'cat'은 무시한다.
 * @property {Tier|null} [tier]       노드 계층 티어(v3). 없으면 core 취급(구버전 호환).
 * @property {NodeState|null} [state] 최신 시장 상태 오버레이(v3 선택)
 * @property {number|null} [layer]
 * @property {string|null} [series]
 * @property {string|null} [desc]     짧은 설명(1~240자)
 * @property {string|null} [descSrc]  설명 출처 표기(1~120자)
 * @property {string[]|null} [aka]    동의어·표제어(0~12개, 각 1~40자, 중복 금지)
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
 * @property {'+'|'-'|null} [sub]     B 등급 세분(optional). level==='B'일 때만 채운다. B+=데이터 부분 이상 받침, B-=구조 근거만
 * @property {EdgeFlag[]|null} [flags] 구조 경고 플래그(v3 선택)
 * @property {EdgeStats|null} [stats]  검정 경량 요약(v3 선택)
 * @property {number|null} r
 * @property {string} rsrc
 * @property {Evidence[]} evidence
 */

/** @typedef {{src:string,dst:string,r:number,n?:number|null}} CorData */

/**
 * @typedef {Object} GraphMeta
 * @property {string} version
 * @property {string} generated
 * @property {number} nodes
 * @property {number} edges
 * @property {Object<string,number>} levels
 * @property {Object<string,number>} [tiers]
 * @property {MarketRegime|null} [marketRegime]
 */

/**
 * @typedef {Object} GraphData   graph.json v3
 * @property {3} schemaVersion
 * @property {GraphMeta} meta
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

/** @typedef {Path & {confidence:number, lagMonths:number, unknownLags:number, minLevel:Level}} ScoredPath */

/** @typedef {{activeRegime?:string|null, maxDepth?:number, edgeFilter?:EdgeFilter, topK?:number, aggMode?:'dedup'|'sum'}} SimOptions */

/**
 * 시뮬 영향 노드. minLagMonths: 미상 lag를 0으로 가정한 하한(하위호환). minLagKnownMonths: 모든 엣지 lag가 알려진 경로 중 최소 누적 시차(없으면 null).
 * lagUnknownPaths: lag 미상 엣지를 하나 이상 포함한 기여 경로 수.
 * @typedef {{id:string, score:number, sign:Sign, posMass:number, negMass:number, ambiguousMass:number, minLagMonths:number, minLagKnownMonths:number|null, lagUnknownPaths:number, depth:number}} SimImpact */

/** @typedef {{kind:'loop-R'|'loop-B'|'confounder'|'correlation-only'|'edge-flag', nodes:string[], edges?:string[], message:string}} SimWarning */

/** @typedef {{start:string, shockSign:1|-1, regime:string|null, impacts:SimImpact[], paths:ScoredPath[], warnings:SimWarning[], truncated?:boolean}} SimResult */

export {};
