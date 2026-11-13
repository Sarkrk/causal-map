// @ts-check
// 노드 desc·descSrc·aka: 스키마 수용·거부, migrate 보존, 검색(aka 매칭·name 우선), 패널 HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import v0 from './fixtures/graph.v0.json' with { type: 'json' };
import v1 from './fixtures/graph.v1.json' with { type: 'json' };
import v2fx from './fixtures/graph.v2.json' with { type: 'json' };
import { migrate } from '../src/schema/migrate.js';
import { validateGraph } from '../src/schema/validate.js';
import { createGraph, searchNodes } from '../src/engine/graph.js';
import { suggestHtml } from '../src/ui/explore.js';
import { nodeDescHtml } from '../src/ui/panel.js';

const schema = JSON.parse(readFileSync(new URL('../src/schema/graph.schema.json', import.meta.url), 'utf8'));

/** @returns {any} */
const base = () => structuredClone(migrate(v1));

/** @param {Record<string, any>} extra @returns {{ok:boolean, errors:string[]}} */
function withNode0(extra) {
  const g = base();
  Object.assign(g.nodes[0], extra);
  return validateGraph(g);
}

test('스키마 수용: desc·descSrc·aka 정상값, null, 생략', () => {
  assert.equal(withNode0({ desc: '기준금리 설명', descSrc: "한국은행 경제금융용어 800선(2026) '기준금리' p.52", aka: ['정책금리', 'Base rate'] }).ok, true);
  assert.equal(withNode0({ desc: null, descSrc: null, aka: null }).ok, true);
  assert.equal(withNode0({ aka: [] }).ok, true);
  assert.equal(withNode0({ desc: 'x'.repeat(240), descSrc: 'x'.repeat(120), aka: ['x'.repeat(40)] }).ok, true);
  assert.equal(validateGraph(base()).ok, true);
});

test('스키마 거부: 길이 초과·빈 문자열·잘못된 타입', () => {
  assert.equal(withNode0({ desc: 'x'.repeat(241) }).ok, false);
  assert.equal(withNode0({ desc: '' }).ok, false);
  assert.equal(withNode0({ descSrc: 'x'.repeat(121) }).ok, false);
  assert.equal(withNode0({ desc: 5 }).ok, false);
  assert.equal(withNode0({ descSrc: ['a'] }).ok, false);
  assert.equal(withNode0({ aka: '정책금리' }).ok, false);
  assert.equal(withNode0({ aka: [1] }).ok, false);
  assert.equal(withNode0({ aka: [''] }).ok, false);
  assert.equal(withNode0({ aka: ['x'.repeat(41)] }).ok, false);
  assert.equal(withNode0({ aka: Array.from({ length: 13 }, (_, i) => 'a' + i) }).ok, false);
  assert.equal(withNode0({ aka: Array.from({ length: 12 }, (_, i) => 'a' + i) }).ok, true);
});

test('스키마 거부: aka 중복', () => {
  const r = withNode0({ aka: ['a', 'b', 'a'] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('duplicate')));
});

test('graph.schema.json 노드 속성에 desc·descSrc·aka 제약이 있다', () => {
  const p = schema.properties.nodes.items.properties;
  assert.equal(p.desc.maxLength, 240);
  assert.equal(p.descSrc.maxLength, 120);
  assert.equal(p.aka.maxItems, 12);
  assert.equal(p.aka.uniqueItems, true);
  assert.equal(p.aka.items.maxLength, 40);
});

test('migrate: v0·v1 노드의 desc·aka 보존, 없으면 키를 만들지 않음', () => {
  for (const raw of [v0, v1]) {
    const src = structuredClone(/** @type {any} */ (raw));
    src.nodes[0].desc = '설명';
    src.nodes[0].descSrc = '출처';
    src.nodes[0].aka = ['별칭'];
    const out = /** @type {any} */ (migrate(src));
    assert.equal(out.nodes[0].desc, '설명');
    assert.equal(out.nodes[0].descSrc, '출처');
    assert.deepEqual(out.nodes[0].aka, ['별칭']);
    assert.ok(!('desc' in out.nodes[1]) && !('aka' in out.nodes[1]) && !('descSrc' in out.nodes[1]));
    assert.ok(validateGraph(out).ok, validateGraph(out).errors.join('\n'));
  }
});

test('migrate: v2 입력은 그대로 같은 객체', () => {
  assert.equal(migrate(v2fx), v2fx);
});

/** @param {string} name @param {string[]} [aka] @returns {any} */
const mk = (name, aka) => ({ id: name, name, cat: 'Policy', ...(aka ? { aka } : {}) });

test('searchNodes: aka 대소문자 무시 부분일치, name 일치 우선', () => {
  const nodes = [mk('가계부채', ['Household Debt']), mk('정책금리', ['기준금리', 'Base Rate']), mk('기준금리 기대')];
  assert.deepEqual(searchNodes(nodes, 'household').map((n) => n.id), ['가계부채']);
  assert.deepEqual(searchNodes(nodes, 'BASE r').map((n) => n.id), ['정책금리']);
  // '기준금리': name 일치(기준금리 기대)가 aka 일치(정책금리)보다 먼저
  assert.deepEqual(searchNodes(nodes, '기준금리').map((n) => n.id), ['기준금리 기대', '정책금리']);
  assert.deepEqual(searchNodes(nodes, '  '), []);
  assert.deepEqual(searchNodes(nodes, '기준금리', (n) => n.id !== '기준금리 기대').map((n) => n.id), ['정책금리']);
});

test('suggestHtml: aka로도 제안되고 입력 노드는 제외', () => {
  const g = createGraph(/** @type {any} */ ({
    ...base(),
    nodes: [mk('A'), mk('정책금리', ['Base Rate']), mk('B')],
    edges: [],
    cors: [],
  }));
  const h = suggestHtml(g, 'base', 'A');
  assert.ok(h.includes('data-id="정책금리"'));
  assert.ok(!suggestHtml(g, 'base', '정책금리').includes('data-id="정책금리"'));
});

test('nodeDescHtml: desc·출처·다른 이름 표시, 없으면 빈 문자열', () => {
  assert.equal(nodeDescHtml(mk('X')), '');
  assert.equal(nodeDescHtml(/** @type {any} */ ({ ...mk('X'), desc: null, aka: [] })), '');
  const h = nodeDescHtml(/** @type {any} */ ({ ...mk('X', ['a', 'b', 'c']), desc: '설명', descSrc: '한은 p.1' }));
  assert.ok(h.includes('설명'));
  assert.ok(h.includes('출처: 한은 p.1'));
  assert.ok(h.includes('다른 이름: a · b · c'));
  // 출처는 desc가 있을 때만
  assert.ok(!nodeDescHtml(/** @type {any} */ ({ ...mk('X'), descSrc: '출처만' })).includes('출처'));
});

test('nodeDescHtml: 모두 이스케이프', () => {
  const h = nodeDescHtml(/** @type {any} */ ({
    ...mk('X', ['<b>a</b>']),
    desc: '<img src=x onerror=alert(1)>',
    descSrc: '<script>x</script>',
  }));
  assert.ok(!h.includes('<img') && !h.includes('<script') && !h.includes('<b>'));
  assert.ok(h.includes('&lt;img'));
});
