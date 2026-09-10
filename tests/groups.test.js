import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../js/groups.js';
import { mulberry32 } from '../js/rng.js';

const TOL = 10;
const mk = () => new Board(3, 3, 100, 100); // деталь i = r*3 + c
const sorted = a => [...a].sort((x, y) => x - y);

test('детали: координаты и крайние', () => {
  const b = mk();
  assert.equal(b.total, 9);
  const p = b.pieces[5];
  assert.deepEqual([p.i, p.r, p.c, p.tx, p.ty], [5, 1, 2, 200, 100]);
  assert.equal(b.pieces[4].edge, false);
  assert.equal(b.pieces.filter(q => q.edge).length, 8);
  assert.deepEqual(sorted(b.neighbors(4)), [1, 3, 5, 7]);
  assert.deepEqual(sorted(b.neighbors(0)), [1, 3]);
});

test('соседи склеиваются, если точки совпадают в пределах допуска', () => {
  const b = mk();
  const g0 = b.addGroup(500, 500, [0]);
  const g1 = b.addGroup(505, 497, [1]);
  const ev = b.drop(g1, TOL);
  assert.deepEqual(ev, [{ type: 'merge', pieces: [1], dx: 5, dy: -3 }]);
  assert.equal(b.groups.length, 1);
  assert.equal(b.groupOf[1], g0);
  assert.deepEqual(g0.pieces, [0, 1]);
});

test('нет склейки за допуском', () => {
  const b = mk();
  b.addGroup(500, 500, [0]);
  const g1 = b.addGroup(520, 500, [1]);
  assert.deepEqual(b.drop(g1, TOL), []);
  assert.equal(b.groups.length, 2);
});

test('несоседи и диагональ не склеиваются', () => {
  const b = mk();
  b.addGroup(500, 500, [0]);
  const g2 = b.addGroup(500, 500, [2]);
  const g4 = b.addGroup(500, 500, [4]);
  assert.deepEqual(b.drop(g2, TOL), []);
  assert.deepEqual(b.drop(g4, TOL), []);
  assert.equal(b.groups.length, 3);
});

test('цепочка слияний', () => {
  const b = mk();
  b.addGroup(300, 300, [0]);
  b.addGroup(301, 300, [2]);
  const m = b.addGroup(299, 302, [1]);
  const ev = b.drop(m, TOL);
  assert.equal(ev.length, 2);
  assert.ok(ev.every(e => e.type === 'merge'));
  assert.equal(b.groups.length, 1);
  assert.deepEqual(sorted(b.groups[0].pieces), [0, 1, 2]);
});

test('слитая группа уходит наверх', () => {
  const b = mk();
  const g0 = b.addGroup(500, 500, [0]);
  b.addGroup(900, 900, [8]);
  const g1 = b.addGroup(502, 500, [1]);
  b.drop(g1, TOL);
  assert.equal(b.groups[b.groups.length - 1], g0);
});

test('установка на поле', () => {
  const b = mk();
  const g = b.addGroup(4, -6, [4]);
  const ev = b.drop(g, TOL);
  assert.deepEqual(ev, [{ type: 'lock', pieces: [4], dx: 4, dy: -6 }]);
  assert.equal(b.placed, 1);
  assert.equal(b.groups.length, 0);
  assert.equal(b.groupOf[4], b.locked);
});

test('склейка с установленной группой — одно событие lock', () => {
  const b = mk();
  b.lockPieces([0]);
  const g = b.addGroup(3, 3, [1]);
  const ev = b.drop(g, TOL);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'lock');
  assert.equal(b.placed, 2);
});

test('победа, когда всё установлено', () => {
  const b = new Board(2, 1, 100, 100);
  const g0 = b.addGroup(.5, 0, [0]);
  const g1 = b.addGroup(200, 200, [1]);
  b.drop(g0, TOL);
  assert.equal(b.isComplete, false);
  g1.x = 1; g1.y = -1;
  b.drop(g1, TOL);
  assert.equal(b.isComplete, true);
});

test('hasProgress и bringToTop', () => {
  const b = mk();
  const a = b.addGroup(500, 500, [0]);
  b.addGroup(900, 900, [8]);
  assert.equal(b.hasProgress(), false);
  b.bringToTop(a);
  assert.equal(b.groups[1], a);
  b.addGroup(502, 500, [1]);
  b.drop(b.groups[2], TOL);
  assert.equal(b.hasProgress(), true);
});

test('scatter: все детали по одной, перемешаны', () => {
  const b = mk();
  b.scatter(300, 300, mulberry32(7));
  assert.equal(b.groups.length, 9);
  assert.ok(b.groups.every(g => g.pieces.length === 1 && !g.locked));
  assert.ok(b.groupOf.every(g => g !== null));
  assert.equal(b.placed, 0);
  assert.notDeepEqual(b.groups.map(g => g.pieces[0]), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('serialize/restore — туда и обратно', () => {
  const b = mk();
  b.scatter(300, 300, mulberry32(3));
  const g = b.groupOf[4]; g.x = 1; g.y = 2; b.drop(g, TOL);
  const g1 = b.groupOf[0]; const g2 = b.groupOf[1]; g1.x = 700.04; g1.y = 700; g2.x = 701; g2.y = 700; b.drop(g2, TOL);
  const data = JSON.parse(JSON.stringify(b.serialize()));
  const b2 = mk();
  b2.restore(data);
  assert.deepEqual(b2.serialize(), data);
  assert.equal(b2.placed, 1);
  assert.equal(b2.groupOf[0], b2.groupOf[1]);
});

test('restore отклоняет битые данные и не меняет состояние', () => {
  const b = mk();
  b.scatter(300, 300, mulberry32(1));
  const before = b.serialize();
  const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  assert.throws(() => b.restore('x'));
  assert.throws(() => b.restore([{ x: 0, y: 0, locked: false, p: all.slice(1) }]));
  assert.throws(() => b.restore([{ x: 0, y: 0, locked: false, p: [...all, 0] }]));
  assert.throws(() => b.restore([{ x: 0, y: 0, locked: false, p: [...all.slice(1), 9] }]));
  assert.throws(() => b.restore([{ x: NaN, y: 0, locked: false, p: all }]));
  assert.deepEqual(b.serialize(), before);
});
