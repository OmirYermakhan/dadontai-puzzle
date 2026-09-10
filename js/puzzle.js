import { buildEdges } from './edges.js';
import { Board } from './groups.js';

const SNAP_MS = 120, GLOW_MS = 400, SPARK_MS = 500, FADE_MS = 500, VIEW_MS = 700;
const SPRITE_BUDGET = 40e6;  // пикселей на все спрайты вместе
const CANVAS_LIMIT = 16e6;   // лимит одного холста в iOS Safari
const GLOW_MAX = 80;
const SPARK_COLORS = ['#F3D89A', '#F4B6C2'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const tick = () => new Promise(r => setTimeout(r, 0));

function piecePath(hE, vE, r, c, pw, ph, S) {
  const p = new Path2D();
  const top = hE[r][c].map(([l, w]) => [l * pw, w * S]);
  const right = vE[r][c + 1].map(([l, w]) => [pw + w * S, l * ph]);
  const bottom = hE[r + 1][c].map(([l, w]) => [l * pw, ph + w * S]).reverse();
  const left = vE[r][c].map(([l, w]) => [w * S, l * ph]).reverse();
  p.moveTo(0, 0);
  for (const pts of [top, right, bottom, left]) {
    for (let i = 1; i < 10; i += 3) {
      p.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
    }
  }
  p.closePath();
  return p;
}

export function createPuzzle(canvas, cb = {}) {
  const ctx = canvas.getContext('2d');
  const hitCtx = document.createElement('canvas').getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = () => performance.now();

  let ready = false, startToken = 0;
  let image = null, W = 1, H = 1, pw = 1, ph = 1, S = 1, pad = 0, k = 1, f = 1;
  let board = null, paths = [], sprites = [], lockedCv = null, lockedCtx = null;
  let dpr = 1, scale = 1, ox = 0, oy = 0, minScale = .1, needFit = false;
  let world = { x: 0, y: 0, w: 1, h: 1 };
  let hintOn = true, edgesOnly = false, finished = false, finishT0 = 0;
  let drag = null, pan = null, pinch = null, dirty = true;
  const ptrs = new Map();
  const anims = new Map();    // деталь → { dx, dy, t0 }: визуальная доводка к финальной позиции
  const settling = new Set(); // установленные детали, которые ещё доезжают (не запечены)
  let glows = [], sparks = [], viewAnim = null;

  const free = list => { for (const cv of list) { cv.width = 0; cv.height = 0; } };

  /* ---------- нарезка ---------- */

  async function start({ image: img, cols, rows, seed, groups = null }) {
    const token = ++startToken;
    ready = false;
    drag = pan = pinch = null;
    ptrs.clear();
    canvas.classList.remove('grabbing');
    anims.clear(); settling.clear();
    glows = []; sparks = []; viewAnim = null;
    finished = false; edgesOnly = false;
    free(sprites); sprites = []; paths = [];
    if (lockedCv) free([lockedCv]);

    image = img;
    W = img.naturalWidth || img.width;
    H = img.naturalHeight || img.height;
    pw = W / cols; ph = H / rows; S = Math.min(pw, ph); pad = .45 * S;
    k = clamp(160 / S, 1, 3);
    const px = cols * rows * (pw + 2 * pad) * k * (ph + 2 * pad) * k;
    if (px > SPRITE_BUDGET) k = Math.max(1, k * Math.sqrt(SPRITE_BUDGET / px));
    f = Math.min(2, Math.sqrt(CANVAS_LIMIT / (W * H)));

    const { hE, vE } = buildEdges(cols, rows, seed);
    const b = new Board(cols, rows, pw, ph);
    const ps = [], ss = [];
    for (const p of b.pieces) {
      ps.push(piecePath(hE, vE, p.r, p.c, pw, ph, S));
      ss.push(makeSprite(ps[p.i], p.tx, p.ty));
      if (p.i % 40 === 39) {
        await tick();
        if (token !== startToken) { free(ss); return { cancelled: true, restored: false }; }
      }
    }

    let restored = false;
    if (groups) {
      try { b.restore(groups); restored = true; } catch (e) { console.warn('Сохранение не подошло, начинаю заново', e); }
    }
    if (!restored) b.scatter(W, H);

    board = b; paths = ps; sprites = ss;
    lockedCv = document.createElement('canvas');
    lockedCv.width = Math.ceil(W * f);
    lockedCv.height = Math.ceil(H * f);
    lockedCtx = lockedCv.getContext('2d');
    for (const i of board.locked.pieces) bake(i);
    finished = board.isComplete;
    ready = true;
    resize();
    fit();
    return { cancelled: false, restored };
  }

  function makeSprite(path, tx, ty) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((pw + 2 * pad) * k);
    cv.height = Math.ceil((ph + 2 * pad) * k);
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.scale(k, k);
    g.translate(pad, pad);
    g.save();
    g.clip(path);
    g.drawImage(image, -tx, -ty, W, H);
    g.lineWidth = 2.5 / Math.min(k, 2);
    g.strokeStyle = 'rgba(255,255,255,.28)';
    g.stroke(path);
    g.restore();
    g.lineWidth = 1.2 / Math.min(k, 2);
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.stroke(path);
    return cv;
  }

  function bake(i) {
    const p = board.pieces[i];
    lockedCtx.drawImage(sprites[i], (p.tx - pad) * f, (p.ty - pad) * f, (pw + 2 * pad) * f, (ph + 2 * pad) * f);
  }

  const hasEdge = g => g.pieces.some(i => board.pieces[i].edge);

  /* ---------- камера ---------- */

  function cssSize() {
    const r = canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const { w, h } = cssSize();
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    dirty = true;
  }

  function computeWorld() {
    const m = .4 * W, mY = m * H / W;
    let x0 = -m - pad, y0 = -mY - pad, x1 = W + m + pad, y1 = H + mY + pad;
    for (const g of board.groups) {
      for (const i of g.pieces) {
        const p = board.pieces[i], x = g.x + p.tx, y = g.y + p.ty;
        x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad);
        x1 = Math.max(x1, x + pw + pad); y1 = Math.max(y1, y + ph + pad);
      }
    }
    world = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function viewFor(box, w, h) {
    const s = Math.min(w / box.w, h / box.h);
    return { scale: s, ox: (w - box.w * s) / 2 - box.x * s, oy: (h - box.h * s) / 2 - box.y * s };
  }

  function fit() {
    if (!board) return;
    const { w, h } = cssSize();
    if (!w || !h) { needFit = true; return; }
    needFit = false;
    computeWorld();
    const v = viewFor(world, w, h);
    scale = v.scale; ox = v.ox; oy = v.oy;
    minScale = scale * .7;
    viewAnim = null;
    dirty = true;
  }

  function zoomAt(fac, cx, cy) {
    const ns = clamp(scale * fac, minScale, 8);
    const wx = (cx - ox) / scale, wy = (cy - oy) / scale;
    scale = ns; ox = cx - wx * scale; oy = cy - wy * scale;
    viewAnim = null;
    dirty = true;
  }

  function stepView(t) {
    const p = Math.min(1, (t - viewAnim.t0) / VIEW_MS), e = easeOut(p);
    const A = viewAnim.from, B = viewAnim.to;
    scale = A.scale + (B.scale - A.scale) * e;
    ox = A.ox + (B.ox - A.ox) * e;
    oy = A.oy + (B.oy - A.oy) * e;
    if (p >= 1) viewAnim = null;
  }

  new ResizeObserver(() => { resize(); if (needFit) fit(); }).observe(canvas);

  /* ---------- отрисовка ---------- */

  function piecePos(i) {
    const p = board.pieces[i], g = board.groupOf[i];
    let x = g.x + p.tx, y = g.y + p.ty;
    const a = anims.get(i);
    if (a) {
      const rem = 1 - easeOut(Math.min(1, (now() - a.t0) / SNAP_MS));
      x += a.dx * rem; y += a.dy * rem;
    }
    return { x, y };
  }

  function drawPiece(i, sw, sh) {
    const q = piecePos(i);
    ctx.drawImage(sprites[i], q.x - pad, q.y - pad, sw, sh);
  }

  function drawLifted(sw, sh) {
    const g = drag.g, gx = g.x + drag.dx, gy = g.y + drag.dy;
    ctx.save();
    ctx.translate(gx, gy); ctx.scale(1.03, 1.03); ctx.translate(-gx, -gy);
    if (g.pieces.length <= 30) {
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 16 * dpr;
      ctx.shadowOffsetY = 6 * dpr;
    }
    for (const i of g.pieces) drawPiece(i, sw, sh);
    ctx.restore();
  }

  function drawGlows(t) {
    ctx.strokeStyle = '#F3D89A';
    ctx.lineWidth = 3 / scale;
    for (const gl of glows) {
      ctx.globalAlpha = Math.max(0, 1 - (t - gl.t0) / GLOW_MS);
      for (const i of gl.pieces) {
        const q = piecePos(i);
        ctx.save(); ctx.translate(q.x, q.y); ctx.stroke(paths[i]); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSparks(t) {
    for (const s of sparks) {
      const p = (t - s.t0) / SPARK_MS, e = easeOut(p);
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x + s.vx * e, s.y + s.vy * e, (3 + 2 * (1 - p)) / scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!ready) return;
    const t = now();
    const fading = finished && t - finishT0 < SNAP_MS + FADE_MS + 50;
    if (!dirty && !anims.size && !settling.size && !glows.length && !sparks.length && !viewAnim && !fading) return;
    dirty = false;

    if (viewAnim) stepView(t);
    for (const [i, a] of anims) if (t - a.t0 >= SNAP_MS) anims.delete(i);
    for (const i of settling) if (!anims.has(i)) { bake(i); settling.delete(i); }
    glows = glows.filter(g => t - g.t0 < GLOW_MS);
    sparks = sparks.filter(s => t - s.t0 < SPARK_MS);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = 'rgba(255,247,240,.06)';
    ctx.fillRect(0, 0, W, H);
    if (hintOn && !finished) { ctx.globalAlpha = .22; ctx.drawImage(image, 0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = 'rgba(232,193,112,.55)';
    ctx.strokeRect(0, 0, W, H);

    ctx.drawImage(lockedCv, 0, 0, W, H);
    const sw = pw + 2 * pad, sh = ph + 2 * pad;
    for (const i of settling) drawPiece(i, sw, sh);
    if (finished) {
      const a = reduced ? 1 : clamp((t - finishT0 - SNAP_MS) / FADE_MS, 0, 1);
      if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(image, 0, 0, W, H); ctx.globalAlpha = 1; }
    }
    for (const g of board.groups) {
      if ((drag && g === drag.g) || (edgesOnly && !hasEdge(g))) continue;
      for (const i of g.pieces) drawPiece(i, sw, sh);
    }
    if (drag) drawLifted(sw, sh);
    drawGlows(t);
    drawSparks(t);
  }
  requestAnimationFrame(frame);

  /* ---------- ввод ---------- */

  const toLocal = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorld = p => ({ x: (p.x - ox) / scale, y: (p.y - oy) / scale });

  function hitGroup(w) {
    for (let gi = board.groups.length - 1; gi >= 0; gi--) {
      const g = board.groups[gi];
      if (edgesOnly && !hasEdge(g)) continue;
      for (const i of g.pieces) {
        const p = board.pieces[i], x = g.x + p.tx, y = g.y + p.ty;
        if (w.x < x - pad || w.x > x + pw + pad || w.y < y - pad || w.y > y + ph + pad) continue;
        if (hitCtx.isPointInPath(paths[i], w.x - x, w.y - y)) return g;
      }
    }
    return null;
  }

  canvas.addEventListener('pointerdown', e => {
    if (!ready) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* синтетические события в отладке */ }
    const p = toLocal(e);
    ptrs.set(e.pointerId, p);
    viewAnim = null;
    if (ptrs.size === 1) {
      const w = toWorld(p), g = finished ? null : hitGroup(w);
      if (g) {
        board.bringToTop(g);
        for (const i of g.pieces) anims.delete(i);
        drag = { g, dx: w.x - g.x, dy: w.y - g.y };
        cb.onFirstTouch?.();
      } else {
        pan = { sx: p.x, sy: p.y, ox, oy };
      }
      canvas.classList.add('grabbing');
    } else if (ptrs.size === 2) {
      if (drag) { const g = drag.g; drag = null; drop(g); }
      pan = null;
      const [a, b] = [...ptrs.values()];
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ox0: ox, oy0: oy };
    }
    dirty = true;
  });

  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = toLocal(e);
    ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const wx = (pinch.mid.x - pinch.ox0) / pinch.s0, wy = (pinch.mid.y - pinch.oy0) / pinch.s0;
      scale = clamp(pinch.s0 * d / pinch.d0, minScale, 8);
      ox = mid.x - wx * scale; oy = mid.y - wy * scale;
    } else if (drag) {
      const w = toWorld(p);
      drag.g.x = w.x - drag.dx; drag.g.y = w.y - drag.dy;
    } else if (pan) {
      ox = pan.ox + p.x - pan.sx; oy = pan.oy + p.y - pan.sy;
    }
    dirty = true;
  });

  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (drag && ptrs.size === 0) { const g = drag.g; drag = null; drop(g); }
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) { pan = null; canvas.classList.remove('grabbing'); }
    dirty = true;
  }
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', e => {
    if (!ready) return;
    e.preventDefault();
    const p = toLocal(e);
    zoomAt(Math.pow(1.0015, -e.deltaY), p.x, p.y);
  }, { passive: false });

  /* ---------- склейка, установка, победа ---------- */

  function addGlow(list) {
    if (!reduced) glows.push({ pieces: list, t0: now() });
  }

  function addSparks(list) {
    if (reduced) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const i of list) {
      const p = board.pieces[i];
      x0 = Math.min(x0, p.tx); y0 = Math.min(y0, p.ty);
      x1 = Math.max(x1, p.tx + pw); y1 = Math.max(y1, p.ty + ph);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, t = now();
    for (let n = 0; n < 8; n++) {
      const ang = n / 8 * Math.PI * 2 + Math.random() * .4, dist = S * (.6 + Math.random() * .4);
      sparks.push({ x: cx, y: cy, vx: Math.cos(ang) * dist, vy: Math.sin(ang) * dist, t0: t, color: SPARK_COLORS[n % 2] });
    }
  }

  function drop(g) {
    const events = board.drop(g, Math.max(12, .38 * S));
    const t = now(), locks = new Set(), merges = new Set();
    for (const ev of events) {
      for (const i of ev.pieces) {
        let dx = ev.dx, dy = ev.dy;
        const a = anims.get(i);
        if (a) {
          const rem = 1 - easeOut(Math.min(1, (t - a.t0) / SNAP_MS));
          dx += a.dx * rem; dy += a.dy * rem;
        }
        if (!reduced && (dx || dy)) anims.set(i, { dx, dy, t0: t }); else anims.delete(i);
        (ev.type === 'lock' ? locks : merges).add(i);
      }
    }
    if (locks.size) {
      for (const i of locks) { if (anims.has(i)) settling.add(i); else bake(i); }
      addGlow([...locks]);
      addSparks([...locks]);
      cb.onLock?.([...locks]);
    } else if (merges.size) {
      const target = board.groupOf[merges.values().next().value];
      addGlow(target.pieces.length <= GLOW_MAX ? target.pieces.slice() : [...merges]);
      cb.onMerge?.([...merges]);
    }
    dirty = true;
    cb.onChange?.({ placed: board.placed, total: board.total });
    if (board.isComplete) finish();
  }

  function finish() {
    finished = true;
    finishT0 = now();
    drag = null;
    const { w, h } = cssSize();
    if (w && h) {
      const m = .04;
      const to = viewFor({ x: -W * m, y: -H * m, w: W * (1 + 2 * m), h: H * (1 + 2 * m) }, w, h);
      if (reduced) { scale = to.scale; ox = to.ox; oy = to.oy; }
      else viewAnim = { from: { scale, ox, oy }, to, t0: finishT0 };
    }
    dirty = true;
    cb.onWin?.();
  }

  /* ---------- отладка (используется только через #debug) ---------- */

  const debug = {
    get k() { return k; },
    spriteMegapixels: () => sprites.reduce((s, cv) => s + cv.width * cv.height, 0) / 1e6,
    lockedCanvasMegapixels: () => (lockedCv ? lockedCv.width * lockedCv.height / 1e6 : 0),
    client(wx, wy) {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + ox + wx * scale, y: r.top + oy + wy * scale };
    },
    grabbable() {
      const out = [];
      for (const g of board.groups) {
        for (const i of g.pieces) {
          const p = board.pieces[i], cx = g.x + p.tx + pw / 2, cy = g.y + p.ty + ph / 2;
          if (hitGroup({ x: cx, y: cy }) !== g) continue;
          out.push({ i, size: g.pieces.length, from: debug.client(cx, cy), to: debug.client(p.tx + pw / 2, p.ty + ph / 2) });
        }
      }
      return out;
    },
    joinTarget(i, j) {
      const p = board.pieces[i], g = board.groupOf[j];
      return debug.client(g.x + p.tx + pw / 2, g.y + p.ty + ph / 2);
    },
    groupSize: i => board.groupOf[i].pieces.length,
  };

  return {
    start,
    fit,
    zoomIn() { const { w, h } = cssSize(); zoomAt(1.35, w / 2, h / 2); },
    zoomOut() { const { w, h } = cssSize(); zoomAt(1 / 1.35, w / 2, h / 2); },
    setHint(on) { hintOn = on; dirty = true; },
    setEdgesOnly(on) { edgesOnly = on; dirty = true; },
    serialize: () => (board ? board.serialize() : []),
    hasProgress: () => !!board && board.hasProgress(),
    get placed() { return board ? board.placed : 0; },
    get total() { return board ? board.total : 0; },
    debug,
  };
}
