// 2D 포커스 인과 흐름 맵 순수 헬퍼 회귀 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGraph } from '../src/engine/graph.js';
import { pickMovers, pickInitialNode, QUICK_CORE_IDS } from '../src/ui/focus2d.js';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '..', 'graph.json'), 'utf8'));
const graph = createGraph(data);

test('focus2d: pickMovers는 fresh 급변 노드만 |z| 내림차순 반환', () => {
  const movers = pickMovers(graph, 1.4, 8);
  assert.ok(Array.isArray(movers));
  for (let i = 0; i < movers.length; i++) {
    const m = movers[i];
    assert.equal(m.state?.fresh, true);
    assert.ok(Math.abs(m.state?.z ?? 0) >= 1.4);
    if (i > 0) {
      assert.ok(Math.abs(movers[i - 1].state?.z ?? 0) >= Math.abs(m.state?.z ?? 0));
    }
  }
});

test('focus2d: pickInitialNode는 유효한 노드 id를 반환하고 핵심 지표 후보가 존재', () => {
  const id = pickInitialNode(graph);
  assert.ok(id && graph.byId.has(id));
  const present = QUICK_CORE_IDS.filter((k) => graph.byId.has(k));
  assert.ok(present.length >= 5, `핵심 지표 최소 5개 존재 (현재 ${present.length})`);
});
