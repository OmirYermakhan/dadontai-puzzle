import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextWord } from '../js/words.js';
import { mulberry32 } from '../js/rng.js';

const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8];
function draw(n, state, rand) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const r = nextWord(state, 9, rand);
    out.push(r.index);
    state = r.state;
  }
  return { out, state };
}

test('первые 9 — все слова без повторов', () => {
  const { out } = draw(9, null, mulberry32(5));
  assert.deepEqual([...out].sort((a, b) => a - b), ALL);
});

test('вторая колода — снова все, и на стыке нет повтора', () => {
  for (let seed = 0; seed < 300; seed++) {
    const { out } = draw(18, null, mulberry32(seed));
    assert.notEqual(out[9], out[8], 'seed ' + seed);
    assert.deepEqual(out.slice(9).sort((a, b) => a - b), ALL);
  }
});

test('позиция восстанавливается через JSON', () => {
  const a = draw(4, null, mulberry32(11));
  const restored = JSON.parse(JSON.stringify(a.state));
  const b = draw(5, restored, mulberry32(999));
  const full = draw(9, null, mulberry32(11));
  assert.deepEqual([...a.out, ...b.out], full.out);
});

test('битое состояние — новая колода', () => {
  const bads = [
    { order: [0, 1, 2], pos: 1 },
    { order: [0, 0, 1, 2, 3, 4, 5, 6, 7], pos: 0 },
    { order: 'x', pos: 0 },
    5,
    { order: [8, 7, 6, 5, 4, 3, 2, 1, 0], pos: -1 },
  ];
  for (const bad of bads) {
    const r = nextWord(bad, 9, mulberry32(1));
    assert.ok(r.index >= 0 && r.index < 9);
    assert.equal(r.state.pos, 1);
    assert.deepEqual([...r.state.order].sort((a, b) => a - b), ALL);
  }
});
