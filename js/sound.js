export const BPM = 72;

// Колыбельная на пентатонике до-мажор, 3/4. Такт: [[midi, доли], ...]
export const MELODY = [
  [[76, 1], [79, 1], [81, 1]],
  [[79, 2], [76, 1]],
  [[74, 1], [76, 1], [79, 1]],
  [[76, 3]],
  [[84, 1], [81, 1], [79, 1]],
  [[81, 2], [79, 1]],
  [[76, 1], [74, 1], [76, 1]],
  [[79, 3]],
  [[76, 1], [79, 1], [81, 1]],
  [[84, 2], [86, 1]],
  [[81, 1], [79, 1], [76, 1]],
  [[72, 3]],
];
// корень аккомпанемента на каждый такт (вальс: корень на 1-ю долю, квинта на 2-ю и 3-ю)
export const BASS = [60, 60, 55, 60, 57, 57, 55, 55, 60, 57, 55, 60];
export const LOOP_BEATS = MELODY.length * 3;

export const midiToFreq = m => 440 * 2 ** ((m - 69) / 12);

export function buildEvents() {
  const ev = [];
  MELODY.forEach((bar, b) => {
    let beat = b * 3;
    for (const [midi, d] of bar) {
      ev.push({ beat, midi, vol: .32, decay: 1.4 + d * .3 });
      beat += d;
    }
    const root = BASS[b];
    ev.push({ beat: b * 3, midi: root, vol: .16, decay: 2 });
    ev.push({ beat: b * 3 + 1, midi: root + 7, vol: .1, decay: 1.2 });
    ev.push({ beat: b * 3 + 2, midi: root + 7, vol: .1, decay: 1.2 });
  });
  return ev.sort((a, b) => a.beat - b.beat);
}

const MUSIC_VOL = .22;

export function createSound() {
  const EVENTS = buildEvents(), BEAT = 60 / BPM;
  let ctx = null, sfxBus = null, musicBus = null, noise = null;
  let musicOn = false, sfxOn = true, timer = null, loopStart = 0, idx = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = .9;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
      delay.delayTime.value = .28; fb.gain.value = .3; wet.gain.value = .25;
      musicBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
      noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * .08), ctx.sampleRate);
      const ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') ctx.resume();
    return ctx;
  }

  // «колокольчик» шкатулки: синус + тихий обертон ×4, быстрая атака, экспоненциальное затухание
  function bell(dest, freq, t, vol, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .005);
    g.gain.exponentialRampToValueAtTime(.0001, t + decay);
    g.connect(dest);
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = freq; o.connect(g);
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = 'sine'; o2.frequency.value = freq * 4; g2.gain.value = .12;
    o2.connect(g2); g2.connect(g);
    o.start(t); o2.start(t);
    o.stop(t + decay + .05); o2.stop(t + decay + .05);
  }

  function tok(t) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.5, t);
    g.gain.exponentialRampToValueAtTime(.001, t + .06);
    src.connect(bp); bp.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + .08);
    bell(sfxBus, 520, t, .25, .08);
  }

  // планировщик с упреждением: тик 100 мс, окно 0.3 с
  function pump() {
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + .3;
    for (;;) {
      const ev = EVENTS[idx], t = loopStart + ev.beat * BEAT;
      if (t > horizon) break;
      if (t >= ctx.currentTime - .05) bell(musicBus, midiToFreq(ev.midi), t, ev.vol, ev.decay);
      idx++;
      if (idx === EVENTS.length) { idx = 0; loopStart += LOOP_BEATS * BEAT; }
    }
  }

  function startMusic() {
    if (timer || !ensure()) return;
    loopStart = ctx.currentTime + .15; idx = 0;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(MUSIC_VOL, ctx.currentTime, .1);
    timer = setInterval(pump, 100);
    pump();
  }

  function stopMusic() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, .08);
  }

  function buzz(pattern) {
    if (!sfxOn || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* не поддерживается */ }
  }

  return {
    configure({ music, sfx }) { musicOn = !!music; sfxOn = !!sfx; },
    unlock() { ensure(); if (musicOn) startMusic(); },
    setMusic(on) { musicOn = on; if (on) startMusic(); else stopMusic(); },
    setSfx(on) { sfxOn = on; },
    merge() {
      buzz(10);
      if (!sfxOn || !ensure()) return;
      tok(ctx.currentTime + .01);
    },
    lock() {
      buzz([12, 40, 12]);
      if (!sfxOn || !ensure()) return;
      const t = ctx.currentTime + .01;
      bell(sfxBus, midiToFreq(88), t, .3, .25);      // E6
      bell(sfxBus, midiToFreq(93), t + .07, .3, .25); // A6
    },
    win() {
      buzz([30, 60, 30, 60, 120]);
      if (!sfxOn || !ensure()) return;
      const t = ctx.currentTime + .05;
      [84, 88, 91, 96].forEach((m, i) => bell(sfxBus, midiToFreq(m), t + i * .12, .3, 1.2)); // C6 E6 G6 C7
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx) ctx.resume(); },
  };
}
