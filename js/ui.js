import { LEVELS, DEFAULT_LEVEL, WARM_WORDS, gridFor } from './config.js';
import { newSeed } from './rng.js';
import { createStore } from './save.js';
import { createLibrary } from './photos.js';
import { createPuzzle } from './puzzle.js';
import { createSound } from './sound.js';
import { nextWord } from './words.js';
import { createTimer, fmt } from './timer.js';

const $ = s => document.querySelector(s);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = createStore();
const timer = createTimer();
const sound = createSound();
const settings = store.getSettings();
sound.configure(settings);

let library = null;
let selIdx = 0, levelIdx = DEFAULT_LEVEL;
let game = null; // { item, grid, seed } — игра, открытая на экране
let finished = false, touched = false, hintOn = true, edgesOn = false;
let saveTimer = null, startToken = 0, wasRunning = false, toastTimer = null;

const puzzle = createPuzzle($('#c'), {
  onFirstTouch() { if (game && !finished) { timer.start(); touched = true; } },
  onMerge() { sound.merge(); },
  onLock() { sound.lock(); },
  onChange() { updateHud(); scheduleSave(); },
  onWin: win,
});

/* ---------- общее ---------- */

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

function confirmDialog(text, okLabel) {
  return new Promise(resolve => {
    const box = $('#confirm'), ok = $('#confirmOk'), cancel = $('#confirmCancel');
    $('#confirmText').textContent = text;
    ok.textContent = okLabel;
    box.classList.add('show');
    const close = value => {
      box.classList.remove('show');
      ok.onclick = cancel.onclick = null;
      resolve(value);
    };
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить фото ' + url));
    img.src = url;
  });
}

/* ---------- меню ---------- */

const currentItem = () => library.items[selIdx];
const gridOf = item => gridFor(LEVELS[levelIdx], item.w, item.h);
const percent = p => Math.floor(p * 100) + '%';

function renderLevels() {
  const box = $('#levels');
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'lvl';
    b.innerHTML = `<b>${lv.cols * lv.rows}</b><span>${lv.label}</span>`;
    b.onclick = () => { levelIdx = i; renderMenu(); };
    box.appendChild(b);
  });
}

function renderMenu() {
  const done = store.getDone();
  const gallery = $('#gallery');
  gallery.textContent = '';
  library.items.forEach((item, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb-wrap';
    const b = document.createElement('button');
    b.className = 'thumb' + (i === selIdx ? ' selected' : '') + (done.has(item.id) ? ' done' : '');
    b.setAttribute('aria-label', 'Фото ' + (i + 1));
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = '';
    b.appendChild(img);
    const { cols, rows } = gridOf(item);
    const pr = store.progress(item.id, cols, rows);
    if (pr !== null) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = percent(pr);
      b.appendChild(badge);
    }
    b.onclick = () => { selIdx = i; renderMenu(); };
    wrap.appendChild(b);
    if (!item.builtin) {
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Удалить фото');
      del.onclick = () => removePhoto(item.id);
      wrap.appendChild(del);
    }
    gallery.appendChild(wrap);
  });
  const add = document.createElement('button');
  add.className = 'thumb add';
  add.innerHTML = '<b>＋</b>Своё фото';
  add.onclick = () => $('#fileInput').click();
  gallery.appendChild(add);

  [...$('#levels').children].forEach((el, i) => el.classList.toggle('on', i === levelIdx));
  const item = currentItem(), { cols, rows } = gridOf(item);
  const pr = store.progress(item.id, cols, rows);
  $('#play').textContent = pr === null ? 'Играть' : `Продолжить · ${percent(pr)}`;
  const doneCount = library.items.filter(it => done.has(it.id)).length;
  $('#menuStats').textContent = doneCount ? `Собрано ${doneCount} из ${library.items.length}` : '';
}

$('#fileInput').onchange = async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { saved } = await library.addFile(file);
    selIdx = library.items.length - 1;
    renderMenu();
    if (!saved) toast('Фото не сохранится после закрытия вкладки');
  } catch (err) {
    console.warn(err);
    toast('Не получилось открыть это фото');
  }
};

async function removePhoto(id) {
  if (!(await confirmDialog('Удалить фото? Прогресс по нему тоже удалится.', 'Удалить'))) return;
  const k = library.items.findIndex(it => it.id === id);
  await library.remove(id);
  store.clearAllGames(id);
  store.removeDone(id);
  if (k < selIdx) selIdx--;
  selIdx = Math.min(selIdx, library.items.length - 1);
  renderMenu();
}

/* ---------- игра ---------- */

async function startGame(item, fresh = false) {
  const token = ++startToken;
  const grid = gridOf(item);
  if (fresh) store.clearGame(item.id, grid.cols, grid.rows);
  const saved = fresh ? null : store.loadGame(item.id, grid.cols, grid.rows);
  clearTimeout(saveTimer);
  game = null; finished = false; touched = false;
  timer.reset(0);
  $('#win').classList.remove('show');
  $('#loading').style.display = 'grid';
  setEdges(false);
  show('game');

  let image;
  try {
    image = await loadImage(item.url);
  } catch (err) {
    if (token !== startToken) return;
    console.warn(err);
    toast('Не получилось открыть это фото');
    show('menu');
    renderMenu();
    return;
  }
  if (token !== startToken) return;

  const seed = saved ? saved.seed : newSeed();
  const res = await puzzle.start({ image, cols: grid.cols, rows: grid.rows, seed, groups: saved ? saved.groups : null });
  if (res.cancelled || token !== startToken) return;
  if (saved && !res.restored) store.clearGame(item.id, grid.cols, grid.rows);
  timer.reset(res.restored ? saved.secs || 0 : 0);
  touched = res.restored;
  game = { item, grid, seed };
  $('#loading').style.display = 'none';
  updateHud();
}

function updateHud() {
  $('#placed').textContent = puzzle.placed;
  $('#total').textContent = puzzle.total;
  $('#time').textContent = fmt(timer.secs);
}
setInterval(() => { if (game && !finished) $('#time').textContent = fmt(timer.secs); }, 250);

function saveNow() {
  clearTimeout(saveTimer);
  if (!game || finished || !touched) return;
  const { item, grid, seed } = game;
  store.saveGame(item.id, grid.cols, grid.rows, { seed, secs: timer.secs, groups: puzzle.serialize() });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function setEdges(on) {
  edgesOn = on;
  $('#edgesBtn').classList.toggle('on', on);
  puzzle.setEdgesOnly(on);
}

$('#play').onclick = () => {
  sound.unlock();
  startGame(currentItem());
};

$('#back').onclick = () => {
  saveNow();
  startToken++;
  game = null;
  timer.pause();
  $('#win').classList.remove('show');
  show('menu');
  renderMenu();
};

$('#hintBtn').onclick = () => {
  hintOn = !hintOn;
  $('#hintBtn').classList.toggle('on', hintOn);
  puzzle.setHint(hintOn);
};
$('#edgesBtn').onclick = () => setEdges(!edgesOn);
$('#shuffleBtn').onclick = async () => {
  if (!game) return;
  if (!finished && puzzle.hasProgress() && !(await confirmDialog('Начать заново? Собранное перемешается.', 'Перемешать'))) return;
  if (game) startGame(game.item, true);
};
$('#zin').onclick = () => puzzle.zoomIn();
$('#zout').onclick = () => puzzle.zoomOut();
$('#fit').onclick = () => puzzle.fit();

/* ---------- победа ---------- */

function win() {
  if (!game) return;
  const g = game;
  finished = true;
  timer.pause();
  clearTimeout(saveTimer);
  store.clearGame(g.item.id, g.grid.cols, g.grid.rows);
  store.addDone(g.item.id);
  const { index, state } = nextWord(store.getWords(), WARM_WORDS.length);
  store.setWords(state);
  $('#wWord').textContent = WARM_WORDS[index];
  $('#wMeta').textContent = `Собрано · ${puzzle.total} деталей · ${fmt(timer.secs)}`;
  updateHud();
  sound.win();
  if (!reduced) setTimeout(() => { if (game === g) rainHearts(); }, 600);
  setTimeout(() => { if (game === g) $('#win').classList.add('show'); }, reduced ? 300 : 1400);
}

function rainHearts() {
  const h = $('#hearts');
  h.innerHTML = '';
  const chars = ['♥', '♥', '✦', '♥', '✧'], colors = ['#E8C170', '#F4B6C2', '#FFF7F0'];
  for (let i = 0; i < 44; i++) {
    const s = document.createElement('i');
    s.textContent = chars[i % chars.length];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.color = colors[i % 3];
    s.style.fontSize = 14 + Math.random() * 20 + 'px';
    s.style.animationDuration = 2.5 + Math.random() * 2 + 's';
    s.style.animationDelay = Math.random() + 's';
    h.appendChild(s);
  }
  setTimeout(() => { h.innerHTML = ''; }, 5000);
}

$('#next').onclick = () => {
  selIdx = (selIdx + 1) % library.items.length;
  startGame(currentItem());
};
$('#again').onclick = () => startGame(game ? game.item : currentItem(), true);
$('#share').onclick = async () => {
  const data = { title: 'Дәдөнтай жаным менім', text: 'Собери наш пазл 💛', url: location.href.split('#')[0] };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(data.url); $('#share').textContent = 'Ссылка скопирована ✓'; }
  } catch (err) { /* пользователь закрыл окно «Поделиться» */ }
};

/* ---------- звук ---------- */

function refreshToggles() {
  for (const b of document.querySelectorAll('.snd-music')) {
    b.classList.toggle('on', settings.music);
    b.setAttribute('aria-pressed', String(settings.music));
  }
  for (const b of document.querySelectorAll('.snd-sfx')) {
    b.classList.toggle('on', settings.sfx);
    b.setAttribute('aria-pressed', String(settings.sfx));
  }
}
for (const b of document.querySelectorAll('.snd-music')) {
  b.onclick = () => {
    settings.music = !settings.music;
    store.setSettings(settings);
    sound.setMusic(settings.music);
    refreshToggles();
  };
}
for (const b of document.querySelectorAll('.snd-sfx')) {
  b.onclick = () => {
    settings.sfx = !settings.sfx;
    store.setSettings(settings);
    sound.setSfx(settings.sfx);
    refreshToggles();
  };
}

/* ---------- вкладка скрыта / закрыта ---------- */

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveNow();
    wasRunning = timer.running;
    timer.pause();
    sound.suspend();
  } else {
    sound.resume();
    if (wasRunning && game && !finished) timer.start();
    wasRunning = false;
  }
});
window.addEventListener('pagehide', saveNow);

/* ---------- старт ---------- */

async function init() {
  renderLevels();
  refreshToggles();
  library = await createLibrary();
  renderMenu();
  $('#play').disabled = false;
  if (location.hash === '#debug') window.__dp = { puzzle, store, library, timer, sound };
}
init();
