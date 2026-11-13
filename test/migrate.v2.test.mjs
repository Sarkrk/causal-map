// @ts-check
// 스키마 v2: parseLag·parseRegime, v1→v2 마이그레이션, 실제 graph.json, schema.json 일치.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import v0 from './fixtures/graph.v0.json' with { type: 'json' };
import v1 from './fixtures/graph.v1.json' with { type: 'json' };
import v2fx from './fixtures/graph.v2.json' with { type: 'json' };
import { migrate, migrateV1toV2, parseLag, parseRegime } from '../src/schema/migrate.js';
import { validateGraph } from '../src/schema/validate.js';
import { LAGS, REGIMES, LAG_MONTHS, LEVEL_WEIGHT } from '../src/schema/v2.js';

const real = JSON.parse(readFileSync(new URL('../graph.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../src/schema/graph.schema.json', import.meta.url), 'utf8'));

/** @type {[string, string|null][]} */
const LAG_TABLE = [
  ['즉시 반영', 'immediate'],
  ['당일 반응', 'immediate'],
  ['지표와 동행', 'immediate'],
  ['같은 달 반영', 'immediate'],
  ['1개월 선행', 'immediate'], // 경계: N≤1
  ['약 2개월 시차', 'short'],
  ['3개월 후행', 'short'], // 경계: N≤3
  ['4개월 시차', 'medium'],
  ['12개월 선행', 'medium'], // 경계: N≤12
  ['13개월 시차', 'long'],
  ['1분기 선행', 'short'], // 3개월
  ['약 4분기 선행', 'medium'], // 12개월
  ['5분기 시차', 'long'], // 15개월
  ['2년 시차', 'long'],
  ['단기', 'short'],
  ['중기 효과', 'medium'],
  ['장기 효과', 'long'],
  ['2026년 이후 구조적', null], // 날짜는 무시
  ['2015년 이후 민감도 상승', null],
  ['미 10년물 상승', null], // 만기 표기
  ['30년 고정 모기지 금리', null],
  ['5년 평균 상회', null],
  ['6개월 패널 평균임대료', null], // 시차 단서어 없음
  ['단기금리 인상', null], // 자산명
  ['단기 효과는 즉시, 장기엔 소멸', null], // 충돌
  ['3개월 선행, 2년 시차', null], // 충돌
  ['3개월 시차, 2개월 시차', 'short'], // 같은 값 둘은 충돌 아님
  ['', null],
  ['short', 'short'], // 이미 enum
];

for (const [text, want] of LAG_TABLE) {
  test(`parseLag(${JSON.stringify(text)}) → ${want}`, () => {
    assert.equal(parseLag(text), want);
  });
}

test('parseLag: 문자열이 아니면 null', () => {
  assert.equal(parseLag(undefined), null);
  assert.equal(parseLag(null), null);
  assert.equal(parseLag(3), null);
});

/** @type {[string, string|null][]} */
const REGIME_TABLE = [
  ['평시 선형', 'normal'],
  ['위기 시 상관 급등', 'stress'],
  ['VIX 급변 주', 'stress'],
  ['꼬리위험 구간', 'stress'],
  ['패닉 국면', 'stress'],
  ['긴축 국면에서 강함', 'tightening'],
  ['인상기 전달', 'tightening'],
  ['완화 국면', 'easing'],
  ['인하기에는 약화', 'easing'],
  ['침체 시 역전', 'recession'],
  ['부동산 침체·디스인플레', null], // 자산 얘기
  ['확장 국면', 'expansion'],
  ['호황기', 'expansion'],
  ['평시 +, 급변 −', null], // 서로 다른 국면 둘
  ['긴축 시 +, 완화 시 −', null],
  ['연준 긴축경로 기대↑', null], // 노드명
  ['규제완화 기대', null],
  ['규제 강화 시(완화 시 역방향)', null],
  ['변동성 완화', null],
  ['위기 신호 아님', null],
  ['', null],
  ['stress', 'stress'], // 이미 어휘
  ['위기 시 심해짐, 위기 시 전달', 'stress'], // 같은 국면 반복은 충돌 아님
];

for (const [text, want] of REGIME_TABLE) {
  test(`parseRegime(${JSON.stringify(text)}) → ${want}`, () => {
    assert.equal(parseRegime(text), want);
  });
}

test('parseRegime: 문자열이 아니면 null', () => {
  assert.equal(parseRegime(undefined), null);
  assert.equal(parseRegime(7), null);
});

test('migrateV1toV2: 입력을 변경하지 않고 새 객체를 반환', () => {
  const before = JSON.stringify(v1);
  const out = migrateV1toV2(structuredClone(v1));
  assert.notEqual(out, v1);
  const frozen = structuredClone(v1);
  const deepFreeze = (/** @type {any} */ o) => {
    if (o && typeof o === 'object') {
      Object.freeze(o);
      Object.values(o).forEach(deepFreeze);
    }
    return o;
  };
  deepFreeze(frozen);
  const out2 = migrate(frozen); // 동결된 객체를 건드리면 strict mode(ESM)에서 TypeError
  assert.equal(out2.schemaVersion, 2);
  assert.equal(JSON.stringify(v1), before);
  assert.notEqual(out2.edges, frozen.edges);
  assert.notEqual(out2.edges[0], frozen.edges[0]);
  assert.notEqual(out2.meta, frozen.meta);
});

test('migrate: v2 입력은 같은 객체, v1→v2→v2 멱등', () => {
  const a = migrate(v1);
  assert.equal(migrate(a), a);
  assert.deepEqual(migrate(migrate(v1)), a);
  assert.equal(migrate(v2fx), v2fx);
});

test('migrate: v0 → v2 직행, v0→v1→v2와 같은 결과', () => {
  const g = migrate(v0);
  assert.equal(g.schemaVersion, 2);
  assert.equal(validateGraph(g).ok, true);
  assert.deepEqual(g.edges.map((e) => [e.id, e.lag, e.regime]), migrate(v1).edges.map((e) => [e.id, e.lag, e.regime]));
});

test('migrate: 기존 v1 lag 문자열을 먼저 파싱하고, 파싱 불가면 note/cond로 대체', () => {
  const base = structuredClone(v1);
  base.edges[0] = { ...base.edges[0], lag: '약 2개월', note: '3년 시차' };
  base.edges[1] = { ...base.edges[1], lag: '모름', note: '4분기 선행', cond: '긴축 국면' };
  const out = migrate(base);
  assert.equal(out.edges[0].lag, 'short');
  assert.equal(out.edges[1].lag, 'medium');
  assert.equal(out.edges[1].regime, 'tightening');
  assert.equal(validateGraph(out).ok, true);
});

test('실제 graph.json: migrate→validate 오류 0, 모든 엣지에 lag·regime 키', () => {
  const g = migrate(real);
  const r = validateGraph(g);
  assert.deepEqual(r.errors, []);
  assert.equal(g.edges.length, real.edges.length);
  assert.ok(g.edges.every((e) => 'lag' in e && 'regime' in e));
  assert.ok(g.edges.every((e) => e.lag === null || LAGS.includes(/** @type {any} */ (e.lag))));
  assert.ok(g.edges.every((e) => e.regime === null || REGIMES.includes(/** @type {string} */ (e.regime))), '파서는 정규 어휘만 낸다');
});

test('실제 graph.json: 이미 마이그레이션한 결과를 다시 마이그레이션해도 동일(멱등)', () => {
  const a = migrate(real);
  assert.deepEqual(migrate(a), a);
});

test('validate: v1 데이터를 직접 넣으면 "migrate 먼저" 오류', () => {
  const r = validateGraph(v1);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => /migrate\(\) first/.test(m)), r.errors.join('\n'));
});

test('validate: lag enum 위반 → 오류, null 허용', () => {
  const g = structuredClone(v2fx);
  g.edges[0].lag = 'soon';
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => m.startsWith('edge F1: lag "soon" invalid')), r.errors.join('\n'));
  g.edges[0].lag = null;
  assert.equal(validateGraph(g).ok, true);
});

test('validate: regime — 문자열 아니면 오류, 어휘 밖이면 warning', () => {
  const g = structuredClone(v2fx);
  g.edges[0].regime = 'bubble';
  let r = validateGraph(g);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(r.warnings.some((m) => m.includes('edge F1: regime "bubble" not in vocabulary')), r.warnings.join('\n'));
  g.edges[0].regime = 5;
  r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => m.includes('edge F1: regime must be a string or null')));
});

test('validate: schemaVersion 3 → 오류', () => {
  const g = { ...structuredClone(v2fx), schemaVersion: 3 };
  assert.equal(validateGraph(g).ok, false);
});

test('validate: 입력 비변경(v2)', () => {
  const g = structuredClone(v2fx);
  g.edges[0].regime = 'bubble';
  const before = JSON.stringify(g);
  validateGraph(g);
  assert.equal(JSON.stringify(g), before);
});

test('픽스처 graph.v2.json: 검증 통과, 구조 요건(R·B 루프, 공통원인, cors, regime 엣지 2)', () => {
  const r = validateGraph(v2fx);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(v2fx.cors.length, 1);
  const withRegime = v2fx.edges.filter((e) => e.regime);
  assert.equal(withRegime.length, 2);
  const sg = (/** @type {string} */ id) => v2fx.edges.find((e) => e.id === id)?.sign;
  // R 루프 F1→F2→F3: 음수 0개, B 루프 F4→F5→F6: 음수 1개
  assert.deepEqual(['F1', 'F2', 'F3'].map(sg), ['+', '+', '+']);
  assert.equal(['F4', 'F5', 'F6'].filter((id) => sg(id) === '-').length, 1);
  // 공통원인: 위험심리 → 주가, 환율
  assert.deepEqual(v2fx.edges.filter((e) => e.src === '위험심리' && ['주가', '환율'].includes(e.dst)).length, 2);
  assert.ok(!v2fx.edges.some((e) => (e.src === '주가' && e.dst === '환율') || (e.src === '환율' && e.dst === '주가')));
});

test('schema.json과 코드의 enum·버전 일치', () => {
  const edgeProps = schema.properties.edges.items.properties;
  assert.equal(schema.$id, 'graph.v2.json');
  assert.equal(schema.properties.schemaVersion.const, 2);
  assert.deepEqual(edgeProps.lag.enum.filter((/** @type {any} */ x) => x !== null), LAGS);
  assert.ok(edgeProps.lag.enum.includes(null));
  assert.deepEqual(edgeProps.regime.type, ['string', 'null']);
  assert.deepEqual(edgeProps.level.enum, Object.keys(LEVEL_WEIGHT));
  assert.deepEqual(Object.keys(LAG_MONTHS), LAGS);
  // 필수 키가 validate.js의 EDGE_REQUIRED와 같은 효과: 필수 키 하나를 빼면 오류
  for (const k of schema.properties.edges.items.required) {
    const g = structuredClone(v2fx);
    delete g.edges[0][k];
    assert.equal(validateGraph(g).ok, false, `missing ${k}`);
  }
});

test('src/schema/*.js에 DOM·저장소 참조가 없다', () => {
  const dir = new URL('../src/schema/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const code = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/\b(document|window|localStorage)\b/.test(code), `${f}에 DOM 참조`);
  }
});
