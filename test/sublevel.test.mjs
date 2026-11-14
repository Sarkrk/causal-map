// @ts-check
// B+/B- 표시 등급(sub) 테스트: 표시 문구·색, 스키마 통과, v1→v2 보존. 실행: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v1 from './fixtures/graph.v1.json' with { type: 'json' };
import { migrate } from '../src/schema/migrate.js';
import { validateGraph } from '../src/schema/validate.js';
import { levelText, levelColor, GC, LEVELS } from '../src/store/labels.js';

/** @returns {any} v1 픽스처를 v2로 올린 깊은 복사본 */
function cloneV1() {
  return structuredClone(migrate(structuredClone(v1)));
}

test('levelText: B만 sub를 붙이고 나머지는 level 그대로', () => {
  assert.equal(levelText('B', '+'), 'B+');
  assert.equal(levelText('B', '-'), 'B-');
  assert.equal(levelText('B', null), 'B');
  assert.equal(levelText('B', undefined), 'B');
  assert.equal(levelText('A', '+'), 'A');
  assert.equal(levelText('C', '-'), 'C');
  assert.equal(levelText('D', null), 'D');
});

test('levelColor: B+는 B색 그대로, B-는 같은 색상에 알파만 낮춤', () => {
  assert.equal(levelColor('B', '+'), GC.B);
  assert.equal(levelColor('B'), GC.B);
  assert.ok(levelColor('B', '-').startsWith(GC.B), levelColor('B', '-'));
  assert.notEqual(levelColor('B', '-'), GC.B);
  assert.equal(levelColor('A', '-'), GC.A);
});

test('필터 등급 목록은 A~D 4개 그대로(B 칩이 B+/B- 모두 포함)', () => {
  assert.deepEqual(LEVELS, ['A', 'B', 'C', 'D']);
});

test('validate: level "B" + sub "+"/"-" → ok', () => {
  const g = cloneV1();
  const i = g.edges.findIndex((/** @type {any} */ e) => e.level === 'B');
  assert.ok(i >= 0, 'B 엣지가 픽스처에 있어야 한다');
  g.edges[i].sub = '+';
  const j = g.edges.findIndex((/** @type {any} */ e, /** @type {number} */ k) => k !== i && e.level === 'B');
  if (j >= 0) g.edges[j].sub = '-';
  const r = validateGraph(g);
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('validate: sub 값이 "+"/"-" 밖이면 오류', () => {
  const g = cloneV1();
  const i = g.edges.findIndex((/** @type {any} */ e) => e.level === 'B');
  g.edges[i].sub = 'x';
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => m.includes('sub "x" invalid')), r.errors.join('\n'));
});

test('validate: B가 아닌 등급의 sub는 경고(오류 아님)', () => {
  const g = cloneV1();
  g.edges[0].sub = '+';
  if (g.edges[0].level === 'B') return; // 픽스처 첫 엣지가 B면 이 검사는 의미 없음
  const r = validateGraph(g);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(r.warnings.some((m) => m.includes('is not B')), r.warnings.join('\n'));
});

test('migrate(v1→v2): sub 보존', () => {
  const raw = structuredClone(v1);
  /** @type {any} */ (raw.edges[0]).sub = '-';
  const out = migrate(raw);
  assert.equal(out.edges[0].sub, '-');
  assert.equal(validateGraph(out).ok, true, validateGraph(out).errors.join('\n'));
});