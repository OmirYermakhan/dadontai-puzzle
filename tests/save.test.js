import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryStorage } from '../js/save.js';

const groups = [
  { x: 10, y: 20, locked: false, p: [0, 1] },
  { x: 0, y: 0, locked: true, p: [2, 3, 4] },
];

test('игра: сохранить, загрузить, очистить', () => {
  const st = createStore(memoryStorage());
  assert.equal(st.loadGame('b1', 3, 3), null);
  st.saveGame('b1', 3, 3, { seed: 42, secs: 75, groups });
  const s = st.loadGame('b1', 3, 3);
  assert.equal(s.v, 1);
  assert.equal(s.seed, 42);
  assert.equal(s.secs, 75);
  assert.deepEqual(s.groups, groups);
  assert.ok(Number.isFinite(s.updated));
  assert.equal(st.loadGame('b1', 4, 4), null);
  st.clearGame('b1', 3, 3);
  assert.equal(st.loadGame('b1', 3, 3), null);
});

test('ключи с префиксом dp1:', () => {
  const mem = memoryStorage();
  createStore(mem).saveGame('b2', 6, 8, { seed: 1, secs: 0, groups });
  assert.notEqual(mem.getItem('dp1:save:b2:6x8'), null);
});

test('битые и чужие версии сохранений игнорируются', () => {
  const mem = memoryStorage();
  const st = createStore(mem);
  mem.setItem('dp1:save:b1:3x3', '{oops');
  assert.equal(st.loadGame('b1', 3, 3), null);
  mem.setItem('dp1:save:b1:3x3', JSON.stringify({ v: 2, seed: 1, groups: [] }));
  assert.equal(st.loadGame('b1', 3, 3), null);
  mem.setItem('dp1:save:b1:3x3', JSON.stringify({ v: 1, seed: 'x', groups: [] }));
  assert.equal(st.loadGame('b1', 3, 3), null);
});

test('progress', () => {
  const st = createStore(memoryStorage());
  assert.equal(st.progress('b1', 3, 3), null);
  st.saveGame('b1', 3, 3, { seed: 1, secs: 0, groups });
  assert.equal(st.progress('b1', 3, 3), 3 / 9);
  st.saveGame('b2', 3, 3, { seed: 1, secs: 0, groups: [groups[0]] });
  assert.equal(st.progress('b2', 3, 3), 0);
});

test('clearAllGames удаляет только сохранения этого фото', () => {
  const st = createStore(memoryStorage());
  const g = { seed: 1, secs: 0, groups };
  st.saveGame('u1', 3, 3, g);
  st.saveGame('u1', 4, 4, g);
  st.saveGame('u10', 3, 3, g);
  st.saveGame('b1', 3, 3, g);
  st.clearAllGames('u1');
  assert.equal(st.loadGame('u1', 3, 3), null);
  assert.equal(st.loadGame('u1', 4, 4), null);
  assert.notEqual(st.loadGame('u10', 3, 3), null);
  assert.notEqual(st.loadGame('b1', 3, 3), null);
});

test('отметки «собрано» сохраняются', () => {
  const mem = memoryStorage();
  const st = createStore(mem);
  assert.equal(st.getDone().size, 0);
  st.addDone('b1'); st.addDone('b2'); st.addDone('b1');
  assert.equal(st.getDone().size, 2);
  st.removeDone('b1');
  assert.deepEqual([...createStore(mem).getDone()], ['b2']);
});

test('настройки: по умолчанию включены, сохраняются', () => {
  const mem = memoryStorage();
  const st = createStore(mem);
  assert.deepEqual(st.getSettings(), { music: true, sfx: true });
  st.setSettings({ music: false, sfx: true });
  assert.deepEqual(createStore(mem).getSettings(), { music: false, sfx: true });
  mem.setItem('dp1:settings', 'null');
  assert.deepEqual(st.getSettings(), { music: true, sfx: true });
});

test('состояние колоды слов', () => {
  const st = createStore(memoryStorage());
  assert.equal(st.getWords(), null);
  st.setWords({ order: [1, 0], pos: 1 });
  assert.deepEqual(st.getWords(), { order: [1, 0], pos: 1 });
});

test('ошибки записи не ломают игру', () => {
  const bad = memoryStorage();
  bad.setItem = () => { throw new Error('QuotaExceededError'); };
  const st = createStore(bad);
  assert.doesNotThrow(() => st.saveGame('b1', 3, 3, { seed: 1, secs: 0, groups }));
  assert.doesNotThrow(() => st.addDone('b1'));
  assert.doesNotThrow(() => st.setSettings({ music: true, sfx: false }));
});
