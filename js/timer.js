export function createTimer(now = () => performance.now()) {
  let acc = 0, t0 = null;
  return {
    start() { if (t0 === null) t0 = now(); },
    pause() { if (t0 !== null) { acc += now() - t0; t0 = null; } },
    reset(secs = 0) { acc = secs * 1000; t0 = null; },
    get running() { return t0 !== null; },
    get secs() { return Math.floor((acc + (t0 === null ? 0 : now() - t0)) / 1000); },
  };
}

export function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
