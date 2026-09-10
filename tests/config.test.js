import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PHOTOS, LEVELS, DEFAULT_LEVEL, WARM_WORDS, gridFor } from '../js/config.js';

test('встроенные фото', () => {
  assert.deepEqual(BUILTIN_PHOTOS.map(p => p.id), ['b1', 'b2', 'b3', 'b4', 'b5']);
  assert.equal(BUILTIN_PHOTOS[2].url, 'photos/3.jpg');
  assert.ok(BUILTIN_PHOTOS.every(p => p.builtin && p.w === 720 && p.h === 960));
});

test('уровни без изменений', () => {
  assert.deepEqual(LEVELS.map(l => [l.cols, l.rows]), [[3, 3], [4, 4], [6, 8], [9, 12], [15, 20], [20, 26]]);
  assert.deepEqual(LEVELS.map(l => l.label), ['разминка', 'легко', 'средне', 'сложно', 'очень сложно', 'как настоящий']);
  assert.equal(DEFAULT_LEVEL, 1);
});

test('тёплые слова дословно', () => {
  assert.deepEqual(WARM_WORDS, [
    'Жаным сол менім',
    'Жүрегім менім жарайсың',
    'Алтыным сол',
    'Ботақаным',
    'Айым, Күнім',
    'Пупсигім менім',
    'Дәдөнтай сені қатты жақсы көрем',
    'Дәдөнтайым',
    'Көтенім',
  ]);
});

test('gridFor: вертикальное и квадратное — как в пресете, горизонтальное — поворот', () => {
  const lv = LEVELS[2];
  assert.deepEqual(gridFor(lv, 720, 960), { cols: 6, rows: 8 });
  assert.deepEqual(gridFor(lv, 1000, 1000), { cols: 6, rows: 8 });
  assert.deepEqual(gridFor(lv, 1600, 1200), { cols: 8, rows: 6 });
});
