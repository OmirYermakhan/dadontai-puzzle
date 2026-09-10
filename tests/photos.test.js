import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitSize, MAX_SIDE } from '../js/photos.js';

test('fitSize уменьшает длинную сторону до 1600', () => {
  assert.equal(MAX_SIDE, 1600);
  assert.deepEqual(fitSize(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(3024, 4032), { w: 1200, h: 1600 });
  assert.deepEqual(fitSize(3000, 1999), { w: 1600, h: 1066 });
});

test('fitSize не увеличивает маленькие фото', () => {
  assert.deepEqual(fitSize(720, 960), { w: 720, h: 960 });
  assert.deepEqual(fitSize(1600, 1600), { w: 1600, h: 1600 });
  assert.deepEqual(fitSize(100, 50), { w: 100, h: 50 });
});
