import type { Rarity } from "./types";

export const START_CREDITS = 1000;
/** Ставка за одну линию выплат. Спин стоит LINE_BET × число линий. */
export const LINE_BET = 20;
export const REFILL_AMOUNT = 1000;

export const spinCost = (lineCount: number) =>
  LINE_BET * Math.max(1, lineCount);

/** Множитель ставки линии по числу совпавших навыков. */
const MULT: Record<number, number> = {
  3: 2.5,
  4: 5,
  5: 10,
  6: 12,
  7: 15,
  8: 18,
  9: 22,
  10: 26,
};

/** Целевая отдача: сколько кредитов в среднем возвращается с каждого поставленного. */
export const TARGET_RTP = 0.95;
/** На этих числах линий масштаб выплат калибруется симуляцией; между ними — интерполяция. */
export const CALIBRATION_LINES = [1, 4, 9, 15, 25];

export const multFor = (matched: number) => MULT[Math.min(10, matched)] ?? 0;

/**
 * Выплата за обмен одного кандидата: ставка линии × множитель(совпадений) × масштаб.
 * Масштаб считается симуляцией под выбранные навыки, пул и число линий (calibratePayScale):
 * редкие навыки платят больше, частые — меньше, и отдача ≈ TARGET_RTP при любом числе линий.
 * Линии — это скорость: больше линий, больше людей за спин.
 */
export function payoutFor(matched: number, scale = 1): number {
  const m = multFor(matched);
  if (!m) return 0;
  return Math.max(5, Math.round((LINE_BET * m * scale) / 5) * 5);
}

/**
 * Масштаб выплат из средней суммы множителей за спин на `lines` линиях.
 * `fixedPerSpin` — средние фиксированные выплаты за спин (утешительный приз бонуса) в ставках линии:
 * они не масштабируются и вычитаются из целевой отдачи.
 */
export function payScaleFrom(meanMultPerSpin: number, lines: number, fixedPerSpin = 0): number {
  if (!(meanMultPerSpin > 0)) return 4;
  return Math.min(40, Math.max(0.3, (TARGET_RTP * lines - fixedPerSpin) / meanMultPerSpin));
}

/** Масштаб для любого числа линий: интерполяция (в логарифмах) между откалиброванными точками. */
export function scaleForLines(table: Record<number, number>, lines: number): number {
  const pts = CALIBRATION_LINES.filter((l) => table[l] != null);
  if (!pts.length) return 4;
  if (table[lines] != null) return table[lines];
  const lo = [...pts].reverse().find((l) => l <= lines) ?? pts[0];
  const hi = pts.find((l) => l >= lines) ?? pts[pts.length - 1];
  if (lo === hi) return table[lo];
  const t = (Math.log(lines) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return Math.exp(Math.log(table[lo]) * (1 - t) + Math.log(table[hi]) * t);
}

const RARITY_NAME: Record<Rarity, string> = {
  common: "Совпадение",
  rare: "Редкий",
  legendary: "ЛЕГЕНДА",
};

export const rarityLabel = (rarity: Rarity, matched: number) =>
  `${RARITY_NAME[rarity]} ×${matched}`;

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
