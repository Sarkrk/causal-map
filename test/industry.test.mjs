// 산업 지도 데이터 무결성 회귀 테스트 — 11/23
// 정본: research/_data/industry/semiconductor.json (앱 industry.json은 빌드 산출물)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeCountry, matchesFilter, rankStageCompanies, FLOW_TOP_N } from '../src/ui/industry.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'research', '_data', 'industry', 'semiconductor.json');
const g = JSON.parse(readFileSync(SRC, 'utf8'));

test('산업지도: 단계·기업 기본 구조', () => {
  assert.ok(Array.isArray(g.stages) && g.stages.length >= 7);
  assert.ok(Array.isArray(g.companies) && g.companies.length >= 70);
  const orders = g.stages.map((s) => s.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), '단계 order 오름차순');
  for (const s of g.stages) {
    assert.ok(s.id && s.name && s.desc && s.color, `단계 ${s.id} 필수 필드`);
  }
});

test('산업지도: 기업 id 유일·단계 참조 유효', () => {
  const ids = g.companies.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, '기업 id 중복');
  const stages = new Set(g.stages.map((s) => s.id));
  for (const c of g.companies) {
    assert.ok(stages.has(c.stage), `${c.id} 단계 참조 오류: ${c.stage}`);
    assert.ok(c.kr && c.country && c.role, `${c.id} 필수 필드`);
    for (const t of c.supplies_to || []) assert.ok(ids.includes(t), `${c.id} supplies_to 미존재: ${t}`);
    for (const t of c.sourced_from || []) assert.ok(ids.includes(t), `${c.id} sourced_from 미존재: ${t}`);
  }
});

test('산업지도: 공급 사슬·병목 참조 유효', () => {
  const ids = new Set(g.companies.map((c) => c.id));
  for (const ch of g.chains) {
    assert.ok(ids.has(ch.from) && ids.has(ch.to), `사슬 참조 오류 ${ch.from}->${ch.to}`);
    assert.ok(ch.what, '사슬 what 필수');
  }
  for (const b of g.bottlenecks || []) {
    for (const cid of b.companies || []) assert.ok(ids.has(cid), `병목 기업 미존재: ${cid}`);
  }
});

test('산업지도: 단계 흐름은 전진, 피드백은 aisw→fabless 하나만', () => {
  const order = Object.fromEntries(g.stages.map((s) => [s.id, s.order]));
  for (const s of g.stages) {
    for (const t of s.flows_to || []) {
      assert.ok(order[t] !== undefined, `${s.id} flows_to 미존재: ${t}`);
      const feedback = s.id === 'aisw' && t === 'fabless'; // 인기→칩 설계사 수요 선순환(의도된 피드백)
      assert.ok(feedback || order[t] > s.order, `${s.id}->${t} 역행`);
    }
  }
});

test('산업지도: 검증 기업은 출처 보유', () => {
  for (const c of g.companies.filter((x) => x.verified)) {
    assert.ok(Array.isArray(c.sources) && c.sources.length > 0, `${c.id} verified인데 출처 없음`);
    for (const s of c.sources) assert.ok(s.url && s.title, `${c.id} 출처 형식`);
  }
});

test('산업지도: 인과 브리지 노드 이름은 문자열 목록', () => {
  for (const s of g.stages) {
    assert.ok(Array.isArray(s.causal_nodes));
    for (const n of s.causal_nodes) assert.equal(typeof n, 'string');
  }
  assert.ok(Array.isArray(g.macro_overlay) && g.macro_overlay.length > 0);
});

test('산업지도 UI 헬퍼: 국가 코드 통일 및 필터·검색 매칭', () => {
  assert.equal(normalizeCountry('한국'), 'KR');
  assert.equal(normalizeCountry('KR'), 'KR');
  assert.equal(normalizeCountry('미국'), 'US');
  assert.equal(normalizeCountry('대만'), 'TW');
  const bnSet = new Set(['skhynix', 'asml']);
  const sk = g.companies.find((c) => c.id === 'skhynix');
  const nvda = g.companies.find((c) => c.id === 'nvidia');
  assert.ok(sk && nvda);
  assert.equal(matchesFilter(sk, 'kr', bnSet, ''), true);
  assert.equal(matchesFilter(nvda, 'kr', bnSet, ''), false);
  assert.equal(matchesFilter(sk, 'bottleneck', bnSet, ''), true);
  assert.equal(matchesFilter(nvda, 'bottleneck', bnSet, ''), false);
  assert.equal(matchesFilter(sk, 'all', bnSet, 'HBM'), true);
  assert.equal(matchesFilter(nvda, 'all', bnSet, 'HBM'), false);

  // 대표기업 우선 정렬: 병목·검증·공급사슬 연결도가 높은 기업이 상위 4개 안에 배치된다
  const equipComps = g.companies.filter((c) => c.stage === 'equip');
  const fullBn = new Set((g.bottlenecks || []).flatMap((b) => b.companies || []));
  const ranked = rankStageCompanies(equipComps, g.chains, fullBn);
  assert.equal(ranked.length, equipComps.length);
  const topIds = ranked.slice(0, FLOW_TOP_N).map((c) => c.id);
  assert.ok(topIds.includes('asml'), '장비 대표 상위에 ASML 포함');
  assert.ok(topIds.includes('hanmi'), '장비 대표 상위에 한미반도체 포함');
});