import { isEdgePiece } from './edges.js';

// Группа хранит «точку начала картинки» (x, y): мировая позиция детали = (x + tx, y + ty).
// Две соседние детали подходят друг другу ровно тогда, когда точки их групп совпадают.
export class Board {
  constructor(cols, rows, pw, ph) {
    this.cols = cols; this.rows = rows; this.pw = pw; this.ph = ph;
    this.pieces = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.pieces.push({ i: r * cols + c, r, c, tx: c * pw, ty: r * ph, edge: isEdgePiece(r, c, cols, rows) });
      }
    }
    this.groups = [];
    this.locked = { x: 0, y: 0, pieces: [], locked: true };
    this.groupOf = new Array(this.pieces.length).fill(null);
  }

  get total() { return this.pieces.length; }
  get placed() { return this.locked.pieces.length; }
  get isComplete() { return this.placed === this.total; }

  clear() {
    this.groups = [];
    this.locked.pieces = [];
    this.groupOf.fill(null);
  }

  addGroup(x, y, pieceIdx) {
    const g = { x, y, pieces: [...pieceIdx], locked: false };
    for (const i of g.pieces) this.groupOf[i] = g;
    this.groups.push(g);
    return g;
  }

  lockPieces(pieceIdx) {
    for (const i of pieceIdx) { this.locked.pieces.push(i); this.groupOf[i] = this.locked; }
  }

  scatter(W, H, rand = Math.random) {
    this.clear();
    const { pw, ph } = this, m = .4 * W, mY = m * H / W;
    const order = this.pieces.map(p => p.i);
    for (let n = order.length - 1; n > 0; n--) {
      const j = Math.floor(rand() * (n + 1));
      [order[n], order[j]] = [order[j], order[n]];
    }
    for (const i of order) {
      const p = this.pieces[i];
      let x, y, tries = 0;
      do {
        x = -m + rand() * (W + 2 * m - pw);
        y = -mY + rand() * (H + 2 * mY - ph);
        tries++;
      } while (x + pw > 0 && x < W && y + ph > 0 && y < H && tries < 50);
      this.addGroup(x - p.tx, y - p.ty, [i]);
    }
  }

  bringToTop(g) {
    const k = this.groups.indexOf(g);
    if (k >= 0 && k !== this.groups.length - 1) { this.groups.splice(k, 1); this.groups.push(g); }
  }

  neighbors(i) {
    const { r, c } = this.pieces[i], out = [];
    if (r > 0) out.push(i - this.cols);
    if (r < this.rows - 1) out.push(i + this.cols);
    if (c > 0) out.push(i - 1);
    if (c < this.cols - 1) out.push(i + 1);
    return out;
  }

  hasProgress() {
    return this.placed > 0 || this.groups.some(g => g.pieces.length > 1);
  }

  // g вливается в h и принимает её точку
  merge(g, h) {
    const ev = { type: h.locked ? 'lock' : 'merge', pieces: g.pieces.slice(), dx: g.x - h.x, dy: g.y - h.y };
    this.groups.splice(this.groups.indexOf(g), 1);
    for (const i of g.pieces) { h.pieces.push(i); this.groupOf[i] = h; }
    if (!h.locked) this.bringToTop(h);
    return ev;
  }

  drop(g, tol) {
    const near = (a, b) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
    const events = [];
    let found = true;
    while (found && !g.locked) {
      found = false;
      outer: for (const i of g.pieces) {
        for (const j of this.neighbors(i)) {
          const h = this.groupOf[j];
          if (!h || h === g || !near(g, h)) continue;
          events.push(this.merge(g, h));
          g = h; found = true;
          break outer;
        }
      }
    }
    if (!g.locked && near(g, this.locked)) events.push(this.merge(g, this.locked));
    return events;
  }

  serialize() {
    const r1 = v => Math.round(v * 10) / 10;
    const out = this.groups.map(g => ({ x: r1(g.x), y: r1(g.y), locked: false, p: g.pieces.slice() }));
    if (this.locked.pieces.length) out.push({ x: 0, y: 0, locked: true, p: this.locked.pieces.slice() });
    return out;
  }

  restore(data) {
    if (!Array.isArray(data)) throw new Error('save: not an array');
    const seen = new Array(this.total).fill(false);
    for (const d of data) {
      if (!d || !Array.isArray(d.p) || !Number.isFinite(d.x) || !Number.isFinite(d.y)) throw new Error('save: bad group');
      for (const i of d.p) {
        if (!Number.isInteger(i) || i < 0 || i >= this.total || seen[i]) throw new Error('save: bad piece ' + i);
        seen[i] = true;
      }
    }
    if (seen.includes(false)) throw new Error('save: missing pieces');
    this.clear();
    for (const d of data) {
      if (d.locked) this.lockPieces(d.p); else this.addGroup(d.x, d.y, d.p);
    }
  }
}
