import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/rng.js';
import { buildEdges, FLAT, isEdgePiece } from '../js/edges.js';

test('mulberry32 детерминирован и в [0,1)', () => {
  const a = mulberry32(123), b = mulberry32(123);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('одно зерно — одинаковые кромки, разные — разные', () => {
  assert.deepEqual(buildEdges(4, 5, 42), buildEdges(4, 5, 42));
  assert.notDeepEqual(buildEdges(4, 5, 1), buildEdges(4, 5, 2));
});

test('размеры массивов и плоские внешние кромки', () => {
  const { hE, vE } = buildEdges(3, 4, 9);
  assert.equal(hE.length, 5);
  assert.ok(hE.every(row => row.length === 3));
  assert.equal(vE.length, 4);
  assert.ok(vE.every(row => row.length === 4));
  for (let c = 0; c < 3; c++) { assert.equal(hE[0][c], FLAT); assert.equal(hE[4][c], FLAT); }
  for (let r = 0; r < 4; r++) { assert.equal(vE[r][0], FLAT); assert.equal(vE[r][3], FLAT); }
  assert.notEqual(hE[1][0], FLAT);
  assert.notEqual(vE[0][1], FLAT);
  assert.equal(hE[1][0].length, 10);
  assert.deepEqual(hE[1][0][0], [0, 0]);
  assert.deepEqual(hE[1][0][9], [1, 0]);
});

test('isEdgePiece', () => {
  assert.equal(isEdgePiece(0, 1, 3, 3), true);
  assert.equal(isEdgePiece(1, 0, 3, 3), true);
  assert.equal(isEdgePiece(2, 1, 3, 3), true);
  assert.equal(isEdgePiece(1, 2, 3, 3), true);
  assert.equal(isEdgePiece(1, 1, 3, 3), false);
});
