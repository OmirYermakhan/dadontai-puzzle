const P = 'dp1:';

export function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem(P + 'probe', '1');
    s.removeItem(P + 'probe');
    return s;
  } catch (e) {
    console.warn('localStorage недоступен, прогресс не сохранится', e);
    return memoryStorage();
  }
}

export function createStore(storage = defaultStorage()) {
  const read = (k, fallback) => {
    try {
      const v = storage.getItem(P + k);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  };
  const write = (k, v) => {
    try { storage.setItem(P + k, JSON.stringify(v)); } catch (e) { console.warn('Не удалось сохранить', k, e); }
  };
  const remove = k => {
    try { storage.removeItem(P + k); } catch (e) { console.warn('Не удалось удалить', k, e); }
  };
  const gameKey = (id, cols, rows) => `save:${id}:${cols}x${rows}`;

  const api = {
    loadGame(id, cols, rows) {
      const s = read(gameKey(id, cols, rows), null);
      return s && s.v === 1 && Number.isInteger(s.seed) && Array.isArray(s.groups) ? s : null;
    },
    saveGame(id, cols, rows, { seed, secs, groups }) {
      write(gameKey(id, cols, rows), { v: 1, seed, secs, groups, updated: Date.now() });
    },
    clearGame(id, cols, rows) {
      remove(gameKey(id, cols, rows));
    },
    clearAllGames(id) {
      const prefix = `${P}save:${id}:`;
      try {
        for (let i = storage.length - 1; i >= 0; i--) {
          const k = storage.key(i);
          if (k && k.startsWith(prefix)) storage.removeItem(k);
        }
      } catch (e) {
        console.warn('Не удалось удалить сохранения', id, e);
      }
    },
    progress(id, cols, rows) {
      const s = api.loadGame(id, cols, rows);
      if (!s) return null;
      const locked = s.groups.find(g => g && g.locked && Array.isArray(g.p));
      return locked ? locked.p.length / (cols * rows) : 0;
    },
    getDone() {
      const v = read('done', []);
      return new Set(Array.isArray(v) ? v : []);
    },
    addDone(id) {
      const d = api.getDone(); d.add(id); write('done', [...d]);
    },
    removeDone(id) {
      const d = api.getDone(); d.delete(id); write('done', [...d]);
    },
    getSettings() {
      const v = read('settings', {}) || {};
      return { music: v.music !== false, sfx: v.sfx !== false };
    },
    setSettings(s) {
      write('settings', { music: !!s.music, sfx: !!s.sfx });
    },
    getWords() {
      return read('words', null);
    },
    setWords(state) {
      write('words', state);
    },
  };
  return api;
}

/* ---------- свои фото: IndexedDB ---------- */

export function openPhotoDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB недоступна')); return; }
    const req = indexedDB.open('dadontai', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB заблокирована'));
  });
}

function inStore(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const req = fn(tx.objectStore('photos'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const photoDb = {
  async list(db) {
    const all = await inStore(db, 'readonly', st => st.getAll());
    return all.sort((a, b) => a.added - b.added);
  },
  put(db, rec) {
    return inStore(db, 'readwrite', st => st.put(rec));
  },
  remove(db, id) {
    return inStore(db, 'readwrite', st => st.delete(id));
  },
};
