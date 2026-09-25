// Сгенерировано вместе с public/audio. Все файлы — CC0, см. CREDITS.md.
// Громкость звуков — в volumes.ts.

export type Bus = 'music' | 'ambient' | 'sfx' | 'ui';

export interface SoundDef {
  /** имя файла в public/audio без расширения (.ogg / .mp3) */
  file: string;
  bus: Bus;
  loop?: boolean;
}

export const SOUNDS = {
  ambient: { file: 'ambient', bus: 'ambient', loop: true }, // Фон: ночной офис, 40.0 с
  lever: { file: 'lever', bus: 'sfx' }, // Рычаг / SPIN, 0.6 с
  'reel-loop': { file: 'reel-loop', bus: 'sfx', loop: true }, // Вращение барабанов и колеса (разная скорость), 2.4 с
  'reel-stop': { file: 'reel-stop', bus: 'sfx' }, // Остановка барабана, 0.23 с
  button: { file: 'button', bus: 'ui' }, // Кнопки автомата, 0.09 с
  'ui-click': { file: 'ui-click', bus: 'ui' }, // UI-клик, 0.09 с
  'line-note': { file: 'line-note', bus: 'ui' }, // Нота линии (LloydEvans09, Marimba note struck), 0.6 с — высота по номеру линии
  'line-limit': { file: 'line-limit', bus: 'ui' }, // Упор линий и неактивные кнопки (Kenney, bong_001), 0.16 с
  scatter: { file: 'scatter', bus: 'sfx' }, // Золотая папка (suntemple, Retro Bonus Pickup), 0.25 с
  'win-match': { file: 'win-match', bus: 'sfx' }, // Match, 2.07 с
  'win-strong': { file: 'win-strong', bus: 'sfx' }, // Strong match, 3.79 с
  'win-unicorn': { file: 'win-unicorn', bus: 'sfx' }, // UNICORN (~2 с), 2.6 с
  credits: { file: 'credits', bus: 'sfx' }, // Докрутка кредитов, 2.7 с
  almost: { file: 'almost', bus: 'sfx' }, // Почти, 2.0 с
  cash: { file: 'cash', bus: 'sfx' }, // Обмен / Beg HRD, 2.12 с
  shortlist: { file: 'shortlist', bus: 'ui' }, // Открыть резюме / в шорт-лист (kermite607, Stamp), 0.51 с
  'bonus-enter': { file: 'bonus-enter', bus: 'sfx' }, // Вход в бонус, 6.0 с
  'bonus-music': { file: 'bonus-music', bus: 'music', loop: true }, // Музыка бонуса, 8.1 с
  'folder-match': { file: 'folder-match', bus: 'sfx' }, // Папка: Матч (JapanYoshiTheGamer, 8-bit Correct Answer), 0.8 с
  'folder-miss': { file: 'folder-miss', bus: 'sfx' }, // Папка: Отказ (JapanYoshiTheGamer, 8-bit Wrong Sound), 0.6 с
  'folder-noshow': { file: 'folder-noshow', bus: 'sfx' }, // Папка: Пустая (magnuswaker, Boing 2), 1.0 с
  'folder-shield': { file: 'folder-shield', bus: 'sfx' }, // Папка: Защита (egomassive, Clang), 0.6 с
  'wheel-music': { file: 'wheel-music', bus: 'music', loop: true }, // Музыка колеса (portwain, quiz game music loop BPM 90), 16 с
  'wheel-win': { file: 'wheel-win', bus: 'sfx' }, // Победа на колесе (Fupicat, WinBrass), 2.1 с
  drumroll: { file: 'drumroll', bus: 'sfx' }, // Барабанная дробь, 6.0 с — пока не подключена, отложена
  'wheel-respin': { file: 'wheel-respin', bus: 'sfx' }, // Жёлтый — респин, 1.91 с
} as const satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

/** Скорость лупа вращения барабанов (выше — звонче) */
export const REEL_LOOP_RATE = 1.1;

/** Звук выигрыша по уровню в пуле (rarityInPool) */
export const WIN_SOUND = { common: 'win-match', rare: 'win-strong', legendary: 'win-unicorn' } as const satisfies Record<string, SoundId>;

/** Что грузить сразу после первого жеста пользователя; остальное — в фоне */
export const CRITICAL: SoundId[] = ['button', 'ui-click', 'lever', 'reel-loop', 'reel-stop', 'ambient'];
