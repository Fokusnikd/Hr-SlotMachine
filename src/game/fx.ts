import type { SkillId } from './types'

/**
 * «Фирменные» анимации навыков. Каждому навыку позиции при выборе «кого ищем» достаётся одна из них;
 * повторы допустимы. Дополнительные эффекты (змейка, бегущая рамка, переворот, толчок камеры)
 * зависят от силы выигрыша и добавляются поверх.
 */
export const FX_LIST = [
  { id: 'pop', label: 'Pop' },
  { id: 'jelly', label: 'Jelly' },
  { id: 'jump', label: 'Jump' },
  { id: 'shine', label: 'Shine' },
  { id: 'ring', label: 'Wave' },
  { id: 'sparks', label: 'Sparks' },
  { id: 'swing', label: 'Swing' },
  { id: 'heartbeat', label: 'Pulse' },
] as const

export type FxId = (typeof FX_LIST)[number]['id']

export const fxLabel = (id: FxId) => FX_LIST.find((f) => f.id === id)?.label ?? id

function hash(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Раздаём анимации навыкам позиции: перемешанный список анимаций идёт по кругу, поэтому
 * соседние по частоте навыки получают разные анимации. Зерно — сама позиция: одна и та же
 * позиция всегда даёт одинаковую раздачу.
 */
export function assignFx(skills: SkillId[], seedKey: string): Record<SkillId, FxId> {
  const rng = mulberry32(hash(seedKey))
  const deck = FX_LIST.map((f) => f.id as FxId)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const out: Record<SkillId, FxId> = {}
  skills.forEach((s, i) => (out[s] = deck[i % deck.length]))
  return out
}

/** Какие дополнительные эффекты включаются при данном числе совпадений. */
export function extrasFor(matched: number) {
  return {
    snake: matched >= 3,
    frame: matched >= 4,
    flip: matched >= 5,
    shake: matched >= 5,
    confetti: matched >= 5,
  }
}
