import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MELODY, BASS, LOOP_BEATS, BPM, buildEvents, midiToFreq } from '../js/sound.js';

test('каждый такт — ровно 3 доли', () => {
  MELODY.forEach((bar, i) => {
    assert.equal(bar.reduce((s, [, d]) => s + d, 0), 3, 'такт ' + (i + 1));
  });
});

test('петля 12 тактов ≈ 30 секунд', () => {
  assert.equal(MELODY.length, 12);
  assert.equal(BASS.length, 12);
  assert.equal(LOOP_BEATS, 36);
  assert.equal(LOOP_BEATS * 60 / BPM, 30);
});

test('все ноты из пентатоники до-мажор', () => {
  const ok = new Set([0, 2, 4, 7, 9]);
  for (const ev of buildEvents()) assert.ok(ok.has(ev.midi % 12), 'midi ' + ev.midi);
});

test('события отсортированы, внутри петли, полный набор', () => {
  const ev = buildEvents();
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].beat >= ev[i - 1].beat);
  assert.ok(ev.every(e => e.beat >= 0 && e.beat < LOOP_BEATS && e.vol > 0 && e.decay > 0));
  assert.equal(ev.length, MELODY.flat().length + 36);
});

test('midiToFreq', () => {
  assert.equal(midiToFreq(69), 440);
  assert.ok(Math.abs(midiToFreq(72) - 523.25) < .01);
});
