import type { Rng } from './outcome'
import type { Candidate } from './types'

/**
 * Мини-игра «Переговоры об оффере» — попытка заменить выпавшего кандидата на кандидата со
 * следующим уровнем матча. Сам текущий кандидат никогда не меняется: при победе карточка целиком
 * заменяется на заранее и честно выбранного nextCandidate.
 *
 *  • Открытый оффер — запрос кандидата, одна из сумм OFFERS. Выпадает случайно, но распределение
 *    зависит от звёзд матча: чем выше грейд, тем выше обычно запрос (форма — WIN_CHANCE ниже).
 *  • CLOSED_COUNT закрытых офферов — каждый НЕЗАВИСИМО и с РАВНОЙ вероятностью из OFFERS, от грейда
 *    не зависят. Гарантий нет: могут оказаться все выше открытого, все ниже, повторяться.
 *  • Игрок вскрывает один: выше открытого — победа (замена кандидата), равен — пуш (ничего не
 *    меняется), ниже — кандидат уходит.
 */

// ─── НАСТРОЙКИ ───────────────────────────────────────────────────────────────────────────────

/** Фиксированные суммы офферов, $ в год, по возрастанию. */
export const OFFERS = [40_000, 55_000, 70_000, 85_000, 100_000, 115_000, 130_000, 150_000, 175_000, 200_000]

/**
 * Шанс ПОБЕДЫ в мини-игре (%) по числу звёзд матча — единственное, что нужно менять.
 * Всё остальное (распределение открытого оффера) пересчитывается из этих чисел автоматически.
 *
 * Пуш всегда = 100 / OFFERS.length = 10%: закрытые офферы равновероятны, и шанс, что вскрытый
 * совпадёт с открытым, — ровно 1 из 10 при любом открытом. Это математика, а не настройка.
 * Поэтому ПОТЕРЯ = 100 − победа − 10. Допустимый диапазон победы: 0…90.
 *
 *   звёзды: победа  (пуш / потеря)
 */
export const WIN_CHANCE: Record<number, number> = {
  3: 80, //  10 / 10
  4: 68, //  10 / 22
  5: 50, //  10 / 40
  6: 30, //  10 / 60
  7: 20, //  10 / 70
  8: 10, //  10 / 80
  9: 7, //   10 / 83
  10: 5, //  10 / 85
}

/** Пологость кривой открытого оффера (в «шагах» OFFERS): меньше — запрос кучнее вокруг пика. */
export const OFFER_SPREAD = 1.5

export const CLOSED_COUNT = 5

// ─────────────────────────────────────────────────────────────────────────────────────────────

export type Outcome = 'won' | 'pushed' | 'lost'

export interface UpgradeGame {
  candidateId: string
  /** Кандидат, который займёт место текущего при победе (выбран заранее и честно). */
  nextCandidate: Candidate
  /** Звёзды матча текущего кандидата. */
  grade: number
  /** Открытый оффер — индекс в OFFERS. */
  open: number
  /** Закрытые офферы — индексы в OFFERS, каждый независимый и равновероятный. */
  closed: number[]
  /** Какой закрытый оффер вскрыл игрок (индекс в closed); до выбора — null. */
  picked: number | null
  status: 'play' | Outcome
}

export const PUSH_CHANCE = 100 / OFFERS.length

/** Итоговые шансы (%) для грейда — то, что реально получит игрок. */
export function chancesFor(grade: number): { win: number; push: number; lose: number } {
  const win = winTarget(grade) * 100
  return { win, push: PUSH_CHANCE, lose: 100 - win - PUSH_CHANCE }
}

/** Шанс победы (доля) для грейда: из таблицы, для отсутствующих — ближайший заданный, в пределах возможного. */
function winTarget(grade: number): number {
  const keys = Object.keys(WIN_CHANCE).map(Number).sort((a, b) => a - b)
  const key = keys.reduce((best, k) => (Math.abs(k - grade) < Math.abs(best - grade) ? k : best), keys[0])
  const n = OFFERS.length
  const maxWin = ((n - 1) / n) * 100
  return Math.min(maxWin - 0.01, Math.max(0.01, WIN_CHANCE[key])) / 100
}

function gaussWeights(mu: number): number[] {
  const w = OFFERS.map((_, i) => Math.exp(-((i - mu) ** 2) / (2 * OFFER_SPREAD * OFFER_SPREAD)))
  const s = w.reduce((a, b) => a + b, 0)
  return w.map((x) => x / s)
}

const mean = (p: number[]) => p.reduce((a, x, i) => a + x * i, 0)

/**
 * Распределение открытого оффера для грейда (вероятности по OFFERS, сумма = 1).
 * Шанс победы при открытом i = (n−1−i)/n, значит средний шанс победы зависит только от среднего
 * индекса открытого оффера: E[i] = (n−1) − n·win. Подбираем пик гауссовой кривой бисекцией так,
 * чтобы среднее совпало с целевым, — шанс победы получается ровно из WIN_CHANCE.
 */
export function openDistribution(grade: number): number[] {
  const n = OFFERS.length
  const target = n - 1 - n * winTarget(grade)
  let lo = -30
  let hi = n + 30
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2
    if (mean(gaussWeights(mid)) < target) lo = mid
    else hi = mid
  }
  return gaussWeights((lo + hi) / 2)
}

function sample(p: number[], rng: Rng): number {
  let r = rng()
  for (let i = 0; i < p.length; i++) {
    if (r < p[i]) return i
    r -= p[i]
  }
  return p.length - 1
}

export function newUpgrade(candidateId: string, nextCandidate: Candidate, grade: number, rng: Rng = Math.random): UpgradeGame {
  const open = sample(openDistribution(grade), rng)
  const closed = Array.from({ length: CLOSED_COUNT }, () => Math.floor(rng() * OFFERS.length))
  return { candidateId, nextCandidate, grade, open, closed, picked: null, status: 'play' }
}

/** Вскрыть один закрытый оффер (индекс в closed). Возвращает новое состояние, либо то же — если ход невозможен. */
export function pickOffer(g: UpgradeGame, index: number): UpgradeGame {
  if (g.status !== 'play' || g.picked !== null || index < 0 || index >= g.closed.length) return g
  const value = g.closed[index]
  const status: Outcome = value > g.open ? 'won' : value === g.open ? 'pushed' : 'lost'
  return { ...g, picked: index, status }
}
