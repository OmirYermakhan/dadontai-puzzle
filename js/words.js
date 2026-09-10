function shuffled(n, rand) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Колода: все слова по одному разу в случайном порядке, потом новая перетасовка
// (первое слово новой колоды не совпадает с последним предыдущей).
export function nextWord(state, count, rand = Math.random) {
  let order = state && Array.isArray(state.order) ? state.order : null;
  let pos = state && Number.isInteger(state.pos) ? state.pos : 0;
  const valid = !!order && order.length === count &&
    [...order].sort((a, b) => a - b).every((v, i) => v === i);
  if (!valid || pos < 0 || pos >= count) {
    const last = valid && pos >= count ? order[count - 1] : -1;
    order = shuffled(count, rand);
    if (count > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
    pos = 0;
  }
  return { index: order[pos], state: { order, pos: pos + 1 } };
}
