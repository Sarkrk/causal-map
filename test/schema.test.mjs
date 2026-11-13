// @ts-check
// 스키마 마이그레이션·검증 테스트. 실행: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v0 from './fixtures/graph.v0.json' with { type: 'json' };
import v1 from './fixtures/graph.v1.json' with { type: 'json' };
import { migrate, SCHEMA_VERSION } from '../src/schema/migrate.js';
import { validateGraph } from '../src/schema/validate.js';

/**
 * 깨뜨려도 원본 픽스처가 영향받지 않도록 v1 깊은 복사본을 만든다.
 * @returns {any}
 */
function cloneV1() {
  return structuredClone(v1);
}

test('migrate(v0) → 검증 통과, 개수 83/245/20, 부호에 U+2212 없음', () => {
  const g = migrate(v0);
  assert.equal(g.schemaVersion, SCHEMA_VERSION);
  const r = validateGraph(g);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(g.nodes.length, 83);
  assert.equal(g.edges.length, 245);
  assert.equal(g.cors.length, 20);
  assert.ok(g.edges.every((e) => /** @type {string} */ (e.sign) !== '\u2212'));
  assert.ok(g.edges.every((e) => ['+', '-', '±'].includes(e.sign)));
});

test('migrate(v0) 결과가 graph.v1.json 픽스처와 일치', () => {
  const g = migrate(v0);
  assert.equal(g.nodes.length, v1.nodes.length);
  for (let i = 0; i < v1.nodes.length; i++) {
    const a = g.nodes[i];
    const b = v1.nodes[i];
    assert.equal(a.id, b.id);
    assert.equal(a.name, b.name);
    assert.equal(a.cat, b.cat);
  }
  assert.equal(g.edges.length, v1.edges.length);
  for (let i = 0; i < v1.edges.length; i++) {
    const a = g.edges[i];
    const b = v1.edges[i];
    assert.equal(a.id, b.id, `edge[${i}].id`);
    assert.equal(a.src, b.src, `${b.id}.src`);
    assert.equal(a.dst, b.dst, `${b.id}.dst`);
    assert.equal(a.sign, b.sign, `${b.id}.sign`);
    assert.equal(a.level, b.level, `${b.id}.level`);
    assert.equal(a.status, b.status, `${b.id}.status`);
    assert.equal(a.r, b.r, `${b.id}.r`);
    assert.deepEqual(a.evidence, b.evidence, `${b.id}.evidence`);
  }
  assert.deepEqual(g.cors, v1.cors);
  assert.deepEqual(g.meta, v1.meta);
});

test('migrate(v1)는 그대로 통과(같은 객체)', () => {
  const out = migrate(v1);
  assert.equal(out, v1);
  assert.equal(validateGraph(out).ok, true);
});

test('schemaVersion 99 → unsupported 오류 throw', () => {
  const bad = { ...cloneV1(), schemaVersion: 99 };
  assert.throws(() => migrate(bad), /unsupported schemaVersion 99/);
});

test('validate: 없는 dst → ok=false, 해당 메시지', () => {
  const g = cloneV1();
  const id = g.edges[0].id;
  g.edges[0].dst = 'XXX없는노드';
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes(`edge ${id}: dst "XXX없는노드" not found`), r.errors.join('\n'));
});

test('validate: 중복 엣지 id → ok=false', () => {
  const g = cloneV1();
  g.edges[1].id = g.edges[0].id;
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes(`duplicate edge id "${g.edges[0].id}"`), r.errors.join('\n'));
});

test('validate: 잘못된 sign(유니코드 마이너스) → ok=false', () => {
  const g = cloneV1();
  const id = g.edges[0].id;
  g.edges[0].sign = '\u2212';
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => m.startsWith(`edge ${id}: sign "\u2212" invalid`)), r.errors.join('\n'));
});

test('validate: 자기루프 → ok=false', () => {
  const g = cloneV1();
  const id = g.edges[0].id;
  g.edges[0].dst = g.edges[0].src;
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => m.startsWith(`edge ${id}: self-loop`)), r.errors.join('\n'));
});

test('validate: 잘못된 cat → ok=false', () => {
  const g = cloneV1();
  const name = g.nodes[0].id;
  g.nodes[0].cat = 'Not_A_Category';
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => m.includes(`node "${name}": cat "Not_A_Category" invalid`)), r.errors.join('\n'));
});

test('validate: 같은 (src,dst) 쌍 중복 → ok=false', () => {
  const g = cloneV1();
  const dup = { ...g.edges[0], id: 'EDUP' };
  g.edges.push(dup);
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => m.startsWith('edge EDUP: duplicate pair')), r.errors.join('\n'));
});

test('validate: 노드 additionalProperties 금지', () => {
  const g = cloneV1();
  g.nodes[0].extra = 1;
  const r = validateGraph(g);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((m) => m.includes('unknown key "extra"')), r.errors.join('\n'));
});

test('validate: cors 참조 누락은 오류 아님(warnings)', () => {
  const g = cloneV1();
  g.cors.push({ src: '없는노드A', dst: g.nodes[0].id, r: 0.1, n: 10 });
  const r = validateGraph(g);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(r.warnings.some((m) => m.includes('src "없는노드A" not in nodes')), r.warnings.join('\n'));
});

test('validate: 입력 객체를 변경하지 않음', () => {
  const g = cloneV1();
  const before = JSON.stringify(g);
  validateGraph(g);
  migrate(v0);
  assert.equal(JSON.stringify(g), before);
});
