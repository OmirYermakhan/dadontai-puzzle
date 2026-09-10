import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, fmt } from '../js/timer.js';

test('таймер: старт, пауза, продолжение', () => {
  let t = 0;
  const tm = createTimer(() => t);
  assert.equal(tm.secs, 0);
  assert.equal(tm.running, false);
  tm.start(); t = 2500;
  assert.equal(tm.secs, 2);
  assert.equal(tm.running, true);
  tm.pause(); t = 10000;
  assert.equal(tm.secs, 2);
  tm.start(); t = 11600;
  assert.equal(tm.secs, 4);
  tm.start(); // повторный старт ничего не сбрасывает
  assert.equal(tm.secs, 4);
});

test('таймер: reset с сохранённым временем', () => {
  let t = 0;
  const tm = createTimer(() => t);
  tm.start(); t = 5000;
  tm.reset(90);
  assert.equal(tm.secs, 90);
  assert.equal(tm.running, false);
  tm.start(); t = 6000;
  assert.equal(tm.secs, 91);
});

test('fmt', () => {
  assert.equal(fmt(0), '0:00');
  assert.equal(fmt(65), '1:05');
  assert.equal(fmt(600), '10:00');
});
