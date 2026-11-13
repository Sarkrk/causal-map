// @ts-check
// 충격 시뮬레이션: start에 +1/−1 충격을 주었을 때 단순 경로 전파로 각 노드의 방향·크기를 추정한다.
// 순수 함수. 입력 graph는 변경하지 않는다. 상관(cors)은 전파에 쓰지 않고 경고에만 쓴다.

/** @typedef {import('../types.js').Graph} Graph */
/** @typedef {import('../types.js').EdgeData} EdgeData */
/** @typedef {import('../types.js').EdgeFilter} EdgeFilter */
/** @typedef {import('../types.js').Level} Level */
/** @typedef {import('../types.js').Sign} Sign */
/** @typedef {import('../types.js').ScoredPath} ScoredPath */
/** @typedef {import('../types.js').SimOptions} SimOptions */
/** @typedef {import('../types.js').SimImpact} SimImpact */
/** @typedef {import('../types.js').SimWarning} SimWarning */
/** @typedef {import('../types.js').SimResult} SimResult */
import { cmpStr, compareCycles, findLoops } from './cycles.js';
import { gradeOf } from './graph.js';
import { compareScored, scorePath, signProduct } from './paths.js';
import { regimeFilter } from './regime.js';
import { upstream } from './traverse.js';
import { LAG_MONTHS, LEVEL_WEIGHT } from '../schema/v2.js';

const DEFAULT_DEPTH = 4;
const MAX_DEPTH = 6;
const DEFAULT_TOP_K = 15;
const MAX_PATHS = 20000;
const LOOP_MAX_LEN = 6;
const WARN_LIMIT = 5;
const AMBIGUOUS_RATIO = 0.1;

/**
 * @typedef {Object} Acc            목표 노드별 누적
 * @property {number} pos
 * @property {number} neg
 * @property {number} amb
 * @property {number} minLag
 * @property {number} minLagKnown   lag가 모두 알려진 경로의 최소 누적 시차(없으면 Infinity)
 * @property {number} unkPaths     lag 미상 엣지를 포함한 기여 경로 수
 * @property {number} depth
 * @property {{conf:number, lag:number, nodes:string[], edges:EdgeData[]}[]} best  기여가 큰 경로 최대 2개
 */

/**
 * 정수 옵션 정규화.
 * @param {unknown} v
 * @param {number} dflt
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clampInt(v, dflt, lo, hi) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

/**
 * best 후보 비교: confidence 내림차순 → 시차 오름차순 → 노드열.
 * @param {{conf:number, lag:number, nodes:string[]}} a
 * @param {{conf:number, lag:number, nodes:string[]}} b
 * @returns {number}
 */
function cmpBest(a, b) {
  return b.conf - a.conf || a.lag - b.lag || cmpStr(a.nodes.join('\u0001'), b.nodes.join('\u0001'));
}

/**
 * 루프의 회전 불변 키(가장 작은 노드 id에서 시작하도록 돌린 노드열).
 * @param {string[]} nodes
 * @returns {string}
 */
function loopKey(nodes) {
  let m = 0;
  for (let i = 1; i < nodes.length; i++) if (nodes[i] < nodes[m]) m = i;
  return [...nodes.slice(m), ...nodes.slice(0, m)].join('\u0001');
}

/**
 * start에 shockSign(+1/−1) 충격을 주고 활성 엣지만으로 단순 경로를 maxDepth까지 열거해 전파한다.
 * 경로 기여 = shockSign × 부호곱 × confidence(등급 가중치 곱). '±'가 낀 경로는 기여 절댓값이 ambiguousMass로 간다.
 * 활성 엣지 = regimeFilter(opts.activeRegime) ∧ opts.edgeFilter. maxDepth 기본 4·상한 6, topK 기본 15.
 * 경로 열거가 20000개에 닿으면 멈추고 truncated:true.
 * @param {Graph} g
 * @param {string} startId
 * @param {1|-1} shockSign
 * @param {SimOptions} [opts]
 * @returns {SimResult}
 */
export function simulate(g, startId, shockSign, opts = {}) {
  const activeRegime = opts.activeRegime ?? null;
  const maxDepth = clampInt(opts.maxDepth, DEFAULT_DEPTH, 1, MAX_DEPTH);
  const topK = clampInt(opts.topK, DEFAULT_TOP_K, 1, Infinity);
  const rf = regimeFilter(activeRegime);
  const userFilter = opts.edgeFilter;
  /** @type {EdgeFilter} */
  const active = userFilter ? (e) => rf(e) && userFilter(e) : rf;
  /** @type {SimResult} */
  const result = { start: startId, shockSign, regime: activeRegime, impacts: [], paths: [], warnings: [] };
  if (!g.byId.has(startId)) return result;

  /** @type {Map<string, Acc>} */
  const acc = new Map();
  /** @type {string[]} */
  const nodes = [startId];
  /** @type {Set<string>} */
  const onPath = new Set([startId]);
  /** @type {EdgeData[]} */
  const edges = [];
  let count = 0;
  let truncated = false;

  /**
   * @param {string} v
   * @param {number} conf    지금까지의 신뢰도 곱
   * @param {number} lag     지금까지의 누적 시차(개월)
   * @param {boolean} amb    ±가 낀 경로인가
   * @param {number} neg     음(-) 엣지 개수
   * @param {boolean} unk    lag 미상 엣지가 낀 경로인가
   * @returns {void}
   */
  function dfs(v, conf, lag, amb, neg, unk) {
    for (const e of g.outE.get(v) ?? []) {
      if (truncated) return;
      if (!active(e)) continue;
      const w = e.dst;
      if (onPath.has(w)) continue;
      if (count >= MAX_PATHS) {
        truncated = true;
        return;
      }
      count++;
      const c = conf * (LEVEL_WEIGHT[e.level] ?? LEVEL_WEIGHT.D);
      const l = lag + (e.lag == null ? 0 : (LAG_MONTHS[e.lag] ?? 0));
      const u = unk || e.lag == null;
      const a = amb || e.sign === '±';
      const n = neg + (e.sign === '-' ? 1 : 0);
      nodes.push(w);
      edges.push(e);

      let t = acc.get(w);
      if (!t) {
        t = { pos: 0, neg: 0, amb: 0, minLag: Infinity, minLagKnown: Infinity, unkPaths: 0, depth: edges.length, best: [] };
        acc.set(w, t);
      }
      if (a) t.amb += c;
      else if ((n % 2 === 0 ? 1 : -1) * shockSign > 0) t.pos += c;
      else t.neg += c;
      if (l < t.minLag) t.minLag = l;
      if (u) t.unkPaths++;
      else if (l < t.minLagKnown) t.minLagKnown = l;
      if (edges.length < t.depth) t.depth = edges.length;
      // 기여가 가장 큰 경로 2개 유지(복사는 후보가 될 때만)
      const cand = { conf: c, lag: l, nodes, edges };
      const b = t.best;
      if (b.length < 2 || cmpBest(cand, b[b.length - 1]) < 0) {
        b.push({ conf: c, lag: l, nodes: nodes.slice(), edges: edges.slice() });
        b.sort(cmpBest);
        if (b.length > 2) b.pop();
      }

      if (edges.length < maxDepth) {
        onPath.add(w);
        dfs(w, c, l, a, n, u);
        onPath.delete(w);
      }
      nodes.pop();
      edges.pop();
    }
  }
  dfs(startId, 1, 0, false, 0, false);

  /** @type {SimImpact[]} */
  const all = [];
  for (const [id, t] of acc) {
    const score = t.pos - t.neg;
    const mag = Math.abs(score);
    /** @type {Sign} */
    let sign = score > 0 ? '+' : '-';
    if (t.amb >= mag || mag < AMBIGUOUS_RATIO * (t.pos + t.neg)) sign = '±';
    all.push({ id, score, sign, posMass: t.pos, negMass: t.neg, ambiguousMass: t.amb, minLagMonths: t.minLag, minLagKnownMonths: Number.isFinite(t.minLagKnown) ? t.minLagKnown : null, lagUnknownPaths: t.unkPaths, depth: t.depth });
  }
  all.sort((x, y) => Math.abs(y.score) - Math.abs(x.score) || cmpStr(x.id, y.id));
  const impacts = all.slice(0, topK);

  // 대표 경로: 각 impact의 최상 경로 → 남는 자리에 두 번째 경로
  /** @type {Map<string, ScoredPath[]>} */
  const picked = new Map();
  let budget = topK;
  for (const imp of impacts) {
    if (budget <= 0) break;
    const best = /** @type {Acc} */ (acc.get(imp.id)).best;
    picked.set(imp.id, [toScored(best[0])]);
    budget--;
  }
  for (const imp of impacts) {
    if (budget <= 0) break;
    const best = /** @type {Acc} */ (acc.get(imp.id)).best;
    if (best.length > 1 && picked.has(imp.id)) {
      /** @type {ScoredPath[]} */ (picked.get(imp.id)).push(toScored(best[1]));
      budget--;
    }
  }
  /** @type {ScoredPath[]} */
  const paths = [];
  for (const imp of impacts) paths.push(...(picked.get(imp.id) ?? []));

  result.impacts = impacts;
  result.paths = paths;
  result.warnings = buildWarnings(g, startId, impacts, paths, acc, active, maxDepth);
  if (truncated) result.truncated = true;
  return result;
}

/**
 * best 항목을 ScoredPath로 바꾼다(부호곱·점수 재계산).
 * @param {{nodes:string[], edges:EdgeData[]}} b
 * @returns {ScoredPath}
 */
function toScored(b) {
  return scorePath({ nodes: b.nodes, edges: b.edges, sign: signProduct(b.edges) });
}

/**
 * 경고 생성: loop-R/B, confounder, correlation-only.
 * @param {Graph} g
 * @param {string} startId
 * @param {SimImpact[]} impacts
 * @param {ScoredPath[]} paths
 * @param {Map<string, Acc>} reached  start에서 도달한 모든 노드
 * @param {EdgeFilter} active
 * @param {number} maxDepth
 * @returns {SimWarning[]}
 */
function buildWarnings(g, startId, impacts, paths, reached, active, maxDepth) {
  /** @type {SimWarning[]} */
  const out = [];

  // 루프: 결과 경로 위의 노드를 지나는 루프(활성 엣지만, 길이 ≤ 6)
  /** @type {Set<string>} */
  const onResult = new Set();
  for (const p of paths) for (const n of p.nodes) onResult.add(n);
  /** @type {Map<string, {nodes:string[], edges:EdgeData[], polarity:'R'|'B'|'?'}>} */
  const loops = new Map();
  for (const id of [...onResult].sort(cmpStr)) {
    for (const lp of findLoops(g, id, { maxLen: LOOP_MAX_LEN, limit: 50, filter: active })) {
      if (lp.polarity === '?') continue;
      const key = loopKey(lp.nodes);
      if (!loops.has(key)) loops.set(key, lp);
    }
  }
  const sorted = [...loops.values()].sort(compareCycles);
  for (const kind of /** @type {const} */ (['R', 'B'])) {
    for (const lp of sorted.filter((l) => l.polarity === kind).slice(0, WARN_LIMIT)) {
      const ring = [...lp.nodes, lp.nodes[0]].map((n) => g.byId.get(n)?.name ?? n).join(' → ');
      out.push({
        kind: kind === 'R' ? 'loop-R' : 'loop-B',
        nodes: lp.nodes,
        edges: lp.edges.map((e) => e.id),
        message: kind === 'R' ? `강화 루프(증폭 위험): ${ring}` : `균형 루프(효과가 되돌려질 수 있음): ${ring}`,
      });
    }
  }

  // 공통원인: start와 T 모두의 원인(깊이 ≤ 2)인 제3 노드. start·T를 거치는 경로는 제외.
  const depth = Math.min(2, maxDepth);
  let nConf = 0;
  for (const imp of impacts) {
    if (nConf >= WARN_LIMIT) break;
    const T = imp.id;
    const upS = upstream(g, startId, depth, (e) => active(e) && e.src !== T && e.dst !== T);
    const upT = upstream(g, T, depth, (e) => active(e) && e.src !== startId && e.dst !== startId);
    const common = [...upS.keys()].filter((c) => c !== startId && c !== T && upT.has(c)).sort(cmpStr);
    if (common.length === 0) continue;
    const c = common[0];
    const name = (/** @type {string} */ id) => g.byId.get(id)?.name ?? id;
    out.push({
      kind: 'confounder',
      nodes: [c, startId, T],
      message: `공통원인 가능: 관측된 ${name(startId)}–${name(T)} 동조의 일부는 ${name(c)} 때문일 수 있음${common.length > 1 ? ` 외 ${common.length - 1}개` : ''}`,
    });
    nConf++;
  }

  // 상관만 있음: start와 상관이 있으나 인과 경로가 없는 쌍(cors는 전파에 쓰지 않는다)
  let nCor = 0;
  for (const c of g.cors) {
    if (nCor >= WARN_LIMIT) break;
    const other = c.src === startId ? c.dst : c.dst === startId ? c.src : null;
    if (other === null || other === startId || reached.has(other)) continue;
    const name = g.byId.get(other)?.name ?? other;
    out.push({
      kind: 'correlation-only',
      nodes: [startId, other],
      message: `상관만 있음(인과 아님): ${g.byId.get(startId)?.name ?? startId}–${name} r=${c.r}`,
    });
    nCor++;
  }
  return out;
}
