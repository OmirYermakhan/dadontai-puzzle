import { BUILTIN_PHOTOS } from './config.js';
import { openPhotoDb, photoDb } from './save.js';

export const MAX_SIDE = 1600;

export function fitSize(w, h, max = MAX_SIDE) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

// Декод с учётом поворота снимка (EXIF). Сначала createImageBitmap, запасной путь — <img>.
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, w: bmp.width, h: bmp.height, release: () => bmp.close() };
    } catch (e) {
      // например, старый Safari не знает опцию — пробуем через <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error('Не удалось декодировать фото');
  }
}

export async function downscale(file) {
  const d = await decode(file);
  try {
    if (!d.w || !d.h) throw new Error('Пустое фото');
    const { w, h } = fitSize(d.w, d.h);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(d.src, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) =>
      cv.toBlob(b => (b ? resolve(b) : reject(new Error('Не удалось сжать фото'))), 'image/jpeg', 0.88));
    cv.width = cv.height = 0;
    return { blob, w, h };
  } finally {
    d.release();
  }
}

export async function createLibrary() {
  let db = null;
  try { db = await openPhotoDb(); } catch (e) { console.warn('IndexedDB недоступна', e); }
  let own = [];
  if (db) {
    try { own = await photoDb.list(db); } catch (e) { console.warn('Не удалось прочитать свои фото', e); }
  }
  const items = [
    ...BUILTIN_PHOTOS.map(p => ({ ...p })),
    ...own.map(rec => ({ id: rec.id, builtin: false, w: rec.w, h: rec.h, url: URL.createObjectURL(rec.blob) })),
  ];

  return {
    items,
    async addFile(file) {
      const { blob, w, h } = await downscale(file);
      const rec = { id: 'u' + Date.now(), blob, w, h, added: Date.now() };
      let saved = false;
      if (db) {
        try { await photoDb.put(db, rec); saved = true; } catch (e) { console.warn('Не удалось сохранить фото', e); }
      }
      const item = { id: rec.id, builtin: false, w, h, url: URL.createObjectURL(blob) };
      items.push(item);
      return { item, saved };
    },
    async remove(id) {
      const k = items.findIndex(it => it.id === id);
      if (k < 0 || items[k].builtin) return;
      URL.revokeObjectURL(items[k].url);
      items.splice(k, 1);
      if (db) {
        try { await photoDb.remove(db, id); } catch (e) { console.warn('Не удалось удалить фото', e); }
      }
    },
  };
}
