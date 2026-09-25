import type { Rarity } from "./types";
import { RARITY_NAME } from "../copy";

import { LINE_BET, PAY_MULT, TARGET_RTP } from "./tuning";
// Значения баланса — в tuning.ts.
export { START_CREDITS, LINE_BET, REFILL_AMOUNT, TARGET_RTP } from "./tuning";

export const spinCost = (lineCount: number) =>
  LINE_BET * Math.max(1, lineCount);

const MULT = PAY_MULT;

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

export const rarityLabel = (rarity: Rarity, matched: number) =>
  `${RARITY_NAME[rarity]} ×${matched}`;

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
