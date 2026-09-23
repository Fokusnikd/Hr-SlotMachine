import { REELS } from '../game/outcome'

/** Геометрия окна с барабанами — общая для барабанов, корпуса, линий и камеры. */
export const REEL_GAP = 1.68
export const WIN_W = REEL_GAP * REELS + 0.1
export const WIN_H = 2.94
/** Высота одного ряда (клетки). */
export const ROW_H = WIN_H / 3
/** Плитка навыка: текстура 512×300. */
export const SYMBOL_H = ROW_H - 0.1
export const SYMBOL_W = Math.min(REEL_GAP - 0.14, SYMBOL_H * (512 / 300))

export const reelX = (i: number) => (i - (REELS - 1) / 2) * REEL_GAP
/** Центр ряда: 0 — верх, 1 — середина, 2 — низ. */
export const rowY = (row: number) => (1 - row) * ROW_H
