export const BUILTIN_PHOTOS = [1, 2, 3, 4, 5].map(n => ({
  id: 'b' + n, builtin: true, url: `photos/${n}.jpg`, w: 720, h: 960,
}));

// колонки × ряды для вертикального фото
export const LEVELS = [
  { cols: 3, rows: 3, label: 'разминка' },
  { cols: 4, rows: 4, label: 'легко' },
  { cols: 6, rows: 8, label: 'средне' },
  { cols: 9, rows: 12, label: 'сложно' },
  { cols: 15, rows: 20, label: 'очень сложно' },
  { cols: 20, rows: 26, label: 'как настоящий' },
];
export const DEFAULT_LEVEL = 1;

export const WARM_WORDS = [
  'Жаным сол менім',
  'Жүрегім менім жарайсың',
  'Алтыным сол',
  'Ботақаным',
  'Айым, Күнім',
  'Пупсигім менім',
  'Дәдөнтай сені қатты жақсы көрем',
  'Дәдөнтайым',
  'Көтенім',
];

// У горизонтального фото сетка поворачивается, фото не обрезается
export function gridFor(level, w, h) {
  return w > h ? { cols: level.rows, rows: level.cols } : { cols: level.cols, rows: level.rows };
}
