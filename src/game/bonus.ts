import type { Candidate, SkillId } from './types'
import type { Rng } from './outcome'

/**
 * Бонус «Золотая папка».
 *  • Scatter-символ не связан с навыками и выпадает вместо «пустышки»: доля выбранных навыков
 *    в клетке не меняется, частота людей по линиям — прежняя.
 *  • 3+ папки в любом месте экрана (все 15 клеток, линии не важны) запускают миниигру.
 *  • Миниигра pick-em: 12 папок — 5 «Матч», 5 «Мимо», 2 пустые. Три «Матч» — победа,
 *    три «Мимо» — проигрыш. Каждая папка сверх трёх даёт щит, который гасит одно «Мимо» (максимум 2).
 *    Шанс победы честный и считается точно: 3 папки — 50 %, 4 — 74 %, 5+ — 92 %.
 *  • Победа — кандидат с максимальным числом выбранных навыков (среди равных — случайный,
 *    уже выпадавшие пропускаются). Проигрыш — утешительные кредиты.
 */

// Параметры доски и щитов — в tuning.ts.
import { BOARD_HIRES, BOARD_REJECTS, BOARD_SIZE, BONUS_MIN, HIRES_TO_WIN, MAX_SHIELDS, REJECTS_TO_LOSE } from './tuning'
export { BOARD_HIRES, BOARD_REJECTS, BOARD_SIZE, BONUS_MIN, CONSOLATION_SPINS, HIRES_TO_WIN, MAX_SHIELDS, REJECTS_TO_LOSE } from './tuning'

export type Folder = 'hire' | 'reject' | 'empty'

export const shieldsFor = (scatters: number) => Math.max(0, Math.min(MAX_SHIELDS, scatters - BONUS_MIN))

const comb = (n: number, k: number) => {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

/**
 * Точная вероятность победы: HIRES_TO_WIN-й «Матч» открыт раньше, чем (REJECTS_TO_LOSE + щиты)-й «Мимо».
 * Пустые папки на исход не влияют. Проигрыш ⇔ среди первых (need−1+lose) значимых папок ≥ lose отказов.
 */
export function winChance(scatters: number): number {
  if (scatters < BONUS_MIN) return 0
  const lose = REJECTS_TO_LOSE + shieldsFor(scatters)
  if (lose > BOARD_REJECTS) return 1
  const n = HIRES_TO_WIN - 1 + lose
  const total = comb(BOARD_HIRES + BOARD_REJECTS, n)
  let lost = 0
  for (let r = lose; r <= Math.min(BOARD_REJECTS, n); r++) lost += comb(BOARD_REJECTS, r) * comb(BOARD_HIRES, n - r)
  return 1 - lost / total
}

/** Случайная раскладка папок (Фишер — Йейтс). */
export function makeBoard(rng: Rng = Math.random): Folder[] {
  const board: Folder[] = [
    ...Array<Folder>(BOARD_HIRES).fill('hire'),
    ...Array<Folder>(BOARD_REJECTS).fill('reject'),
    ...Array<Folder>(BOARD_SIZE - BOARD_HIRES - BOARD_REJECTS).fill('empty'),
  ]
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[board[i], board[j]] = [board[j], board[i]]
  }
  return board
}

export type BonusStatus = 'play' | 'won' | 'lost'

export interface BonusGame {
  scatters: number
  shields: number
  board: Folder[]
  /** Порядок открытия: номер хода для открытых папок, −1 — закрыта. */
  openedAt: number[]
  /** Отказы, погашенные щитом (индексы папок). */
  blocked: number[]
  hires: number
  rejects: number
  status: BonusStatus
}

export function newBonus(scatters: number, rng: Rng = Math.random): BonusGame {
  return {
    scatters,
    shields: shieldsFor(scatters),
    board: makeBoard(rng),
    openedAt: Array(BOARD_SIZE).fill(-1),
    blocked: [],
    hires: 0,
    rejects: 0,
    status: 'play',
  }
}

/** Открыть папку. Возвращает новое состояние (или то же, если ход невозможен). */
export function openFolder(g: BonusGame, i: number): BonusGame {
  if (g.status !== 'play' || g.openedAt[i] !== -1 || i < 0 || i >= g.board.length) return g
  const step = g.openedAt.filter((v) => v >= 0).length
  const openedAt = g.openedAt.slice()
  openedAt[i] = step
  const next: BonusGame = { ...g, openedAt }
  const f = g.board[i]
  if (f === 'hire') next.hires++
  if (f === 'reject') {
    if (g.blocked.length < g.shields) next.blocked = [...g.blocked, i]
    else next.rejects++
  }
  if (next.hires >= HIRES_TO_WIN) next.status = 'won'
  else if (next.rejects >= REJECTS_TO_LOSE) next.status = 'lost'
  return next
}

/**
 * Приз миниигры: кандидат с наибольшим числом выбранных навыков среди пула, не выпадавших ранее.
 * Среди равных — случайный.
 */
export function bestCandidate(
  candidates: Candidate[],
  targets: SkillId[],
  exclude: ReadonlySet<string>,
  rng: Rng = Math.random,
): { candidate: Candidate; matched: SkillId[] } | null {
  const t = new Set(targets)
  let best = 0
  let tied: { candidate: Candidate; matched: SkillId[] }[] = []
  for (const c of candidates) {
    if (exclude.has(c.id)) continue
    const matched = [...new Set(c.skills.filter((s) => t.has(s)))]
    if (!matched.length || matched.length < best) continue
    if (matched.length > best) (best = matched.length), (tied = [])
    tied.push({ candidate: c, matched })
  }
  return tied.length ? tied[Math.floor(rng() * tied.length)] : null
}
