import * as THREE from 'three'
import { create } from 'zustand'
import { REELS } from '../game/outcome'

/**
 * Геометрия окна с барабанами — общая для барабанов, корпуса, линий, мини-игр и камеры.
 *
 * Окно подстраивается под экран: автомат должен упираться в края, поэтому при широком экране
 * растут ширина клеток (REEL_GAP), при узком — их высота (ROW_H). Плитка навыка сохраняет
 * пропорции и стоит по центру клетки.
 *
 * Значения — «живые» ES-экспорты: `setLayout` меняет их на месте, а компоненты, которые
 * от них зависят, подписываются через `useLayoutVersion()` и перерисовываются.
 */

/** Базовые размеры (как в исходном 3D-автомате) — минимум, меньше которого окно не сжимается. */
export const BASE_REEL_GAP = 1.68
export const BASE_WIN_H = 2.94
export const BASE_WIN_W = BASE_REEL_GAP * REELS + 0.1

export let REEL_GAP = BASE_REEL_GAP
export let WIN_W = BASE_WIN_W
export let WIN_H = BASE_WIN_H
/** Высота одного ряда (клетки). */
export let ROW_H = WIN_H / 3
/** Плитка навыка: текстура 512×300, пропорции сохраняются. */
export let SYMBOL_H = Math.min(ROW_H - 0.1, (REEL_GAP - 0.14) * (300 / 512))
export let SYMBOL_W = SYMBOL_H * (512 / 300)

export const reelX = (i: number) => (i - (REELS - 1) / 2) * REEL_GAP
/** Центр ряда: 0 — верх, 1 — середина, 2 — низ. */
export const rowY = (row: number) => (1 - row) * ROW_H

/** Плоскости обрезки по верху/низу окна — общие для всех материалов в окне. */
export const CLIP = [new THREE.Plane(new THREE.Vector3(0, -1, 0), WIN_H / 2), new THREE.Plane(new THREE.Vector3(0, 1, 0), WIN_H / 2)]

const useLayoutStore = create<{ version: number }>(() => ({ version: 0 }))

/** Подписка компонента на смену геометрии окна. */
export const useLayoutVersion = () => useLayoutStore((s) => s.version)

/** Меняет размеры окна (округление до 0.02, чтобы не дёргать сцену на каждый пиксель ресайза). */
export function setLayout(winW: number, winH: number) {
  const w = Math.round(Math.max(BASE_WIN_W, winW) * 50) / 50
  const h = Math.round(Math.max(BASE_WIN_H, winH) * 50) / 50
  if (w === WIN_W && h === WIN_H) return
  WIN_W = w
  WIN_H = h
  REEL_GAP = (w - 0.1) / REELS
  ROW_H = h / 3
  SYMBOL_H = Math.min(ROW_H - 0.1, (REEL_GAP - 0.14) * (300 / 512))
  SYMBOL_W = SYMBOL_H * (512 / 300)
  CLIP[0].constant = h / 2
  CLIP[1].constant = h / 2
  useLayoutStore.setState((s) => ({ version: s.version + 1 }))
}
