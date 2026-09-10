import { mulberry32 } from './rng.js';

export const FLAT = [[0, 0], [.1, 0], [.2, 0], [.33, 0], [.45, 0], [.55, 0], [.67, 0], [.8, 0], [.9, 0], [1, 0]];

function tab(rand) {
  const rnd = (a, b) => a + rand() * (b - a);
  const s = rand() < .5 ? 1 : -1;
  const t = rnd(.09, .115) * s, j = () => rnd(-.03, .03);
  const a = j(), b = j(), c = j(), d = j(), e = j();
  return [[0, 0], [.2, a], [.5 + b + d, -t + c], [.5 - t + b, t + c], [.5 - 2 * t + b - d, 3 * t + c],
    [.5 + 2 * t + b - d, 3 * t + c], [.5 + t + b, t + c], [.5 + b + d, -t + c], [.8, e], [1, 0]];
}

// hE[r][c] — кромка над рядом r; vE[r][c] — кромка слева от колонки c
export function buildEdges(cols, rows, seed) {
  const rand = mulberry32(seed);
  const hE = [], vE = [];
  for (let r = 0; r <= rows; r++) {
    hE[r] = [];
    for (let c = 0; c < cols; c++) hE[r][c] = (r === 0 || r === rows) ? FLAT : tab(rand);
  }
  for (let r = 0; r < rows; r++) {
    vE[r] = [];
    for (let c = 0; c <= cols; c++) vE[r][c] = (c === 0 || c === cols) ? FLAT : tab(rand);
  }
  return { hE, vE };
}

export function isEdgePiece(r, c, cols, rows) {
  return r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
}
