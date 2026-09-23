import type { FxId } from '../game/fx'

/** Поза плитки в данный момент: трансформации и включённые слои-эффекты. */
export interface TilePose {
  sx: number
  sy: number
  /** Сдвиг вверх внутри клетки. */
  y: number
  /** Выдвижение к зрителю. */
  z: number
  rotZ: number
  rotY: number
  /** Сила свечения плитки. */
  glow: number
  /** Прогресс блика 0..1, либо −1 — нет. */
  shine: number
  /** Прогресс волны 0..1, либо −1 — нет. */
  ring: number
}

export const restPose = (): TilePose => ({ sx: 1, sy: 1, y: 0, z: 0, rotZ: 0, rotY: 0, glow: 0, shine: -1, ring: -1 })

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
function easeOutBack(p: number) {
  const c1 = 1.7
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

/** Длительность вступления фирменной анимации, с. После — спокойная петля. */
export const INTRO_S = 1.2
/** Шаг «змейки» между слотами, с. */
export const SNAKE_STEP = 0.12
/** Период повтора искр, с. */
export const SPARKS_PERIOD = 2.5

/**
 * Фирменная анимация навыка. `t` — секунды с момента, как слот «загорелся» (с учётом змейки).
 * `calm` — решение по кандидату уже принято: остаётся только мягкое дыхание и свечение.
 */
export function signaturePose(fx: FxId, t: number, calm: boolean): TilePose {
  const p = restPose()
  if (t < 0) return p
  // Свечение разгорается за 0.15 с.
  p.glow = Math.min(1, t / 0.15) * (0.65 + 0.2 * Math.sin(t * 4))
  if (calm) {
    const s = 1.04 + 0.015 * Math.sin(t * 2)
    p.sx = p.sy = s
    p.glow = 0.35 + 0.1 * Math.sin(t * 2)
    return p
  }
  switch (fx) {
    case 'pop': {
      const s = t < 0.35 ? 1 + 0.14 * easeOutBack(t / 0.35) : 1.14 + 0.025 * Math.sin((t - 0.35) * 3)
      p.sx = p.sy = s
      p.z = 0.14 * clamp01(t / 0.2)
      break
    }
    case 'jelly': {
      const k = t < INTRO_S ? 0.22 * Math.sin(t * 16) * Math.exp(-3.5 * t) : 0.03 * Math.sin(t * 5)
      p.sx = 1.05 * (1 + k)
      p.sy = 1.05 * (1 - k)
      p.z = 0.06
      break
    }
    case 'jump': {
      if (t < INTRO_S) p.y = 0.24 * Math.abs(Math.sin((t * Math.PI) / 0.42)) * Math.exp(-1.6 * t)
      else {
        const q = (t - INTRO_S) % 2.4
        p.y = q < 0.4 ? 0.12 * Math.sin((q / 0.4) * Math.PI) : 0
      }
      p.sx = p.sy = 1.05
      p.z = 0.06
      break
    }
    case 'swing': {
      p.rotZ = t < INTRO_S ? 0.26 * Math.sin(t * 11) * Math.exp(-2.8 * t) : 0.05 * Math.sin(t * 2.2)
      p.sx = p.sy = 1.06
      p.z = 0.06
      break
    }
    case 'heartbeat': {
      const q = t % 1.0
      const beat = q < 0.12 ? Math.sin((q / 0.12) * Math.PI) : q > 0.22 && q < 0.34 ? 0.6 * Math.sin(((q - 0.22) / 0.12) * Math.PI) : 0
      p.sx = p.sy = 1.04 + 0.11 * beat
      p.z = 0.06
      break
    }
    case 'shine': {
      p.sx = p.sy = 1.06
      p.z = 0.06
      const q = t % 2.2
      p.shine = q < 0.7 ? q / 0.7 : -1
      break
    }
    case 'ring': {
      p.sx = p.sy = 1.05 + 0.02 * Math.sin(t * 4)
      p.z = 0.06
      const q = t % 1.8
      p.ring = q < 0.9 ? q / 0.9 : -1
      break
    }
    case 'sparks': {
      p.sx = p.sy = 1.06 + 0.02 * Math.sin(t * 6)
      p.z = 0.06
      break
    }
  }
  return p
}

/** Переворот по очереди (для ×5+): начинается после змейки, по 0.15 с на слот. */
export function flipAngle(tt: number, order: number, count: number) {
  const start = count * SNAKE_STEP + 0.35 + order * 0.15
  return Math.PI * 2 * easeInOut(clamp01((tt - start) / 0.55))
}
export const flipStart = (order: number, count: number) => count * SNAKE_STEP + 0.35 + order * 0.15
