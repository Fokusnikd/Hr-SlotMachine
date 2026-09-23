import { REELS, ROWS, SCATTER, spinField, type Field } from './outcome'
import { CALIBRATION_LINES, multFor, payScaleFrom } from './economy'
import { BONUS_MIN, CONSOLATION_SPINS, winChance } from './bonus'

/**
 * Ожидаемая ценность бонуса за спин — точно, без выборки (бонус редкий, 200 спинов дали бы шум):
 * по биномиальному числу папок на 15 клетках, шансу победы и призу. Возвращает масштабируемую часть
 * (множитель лучшего кандидата пула) и фиксированную (утешительный приз) — обе в ставках линии.
 */
export function bonusValue(field: Field, lines: number): { mult: number; fixed: number } {
  const i = field.model.symbols.indexOf(SCATTER)
  const p = i < 0 ? 0 : field.model.probs[i] / field.model.cum[field.model.cum.length - 1]
  const cells = REELS * ROWS
  let mult = 0
  let fixed = 0
  let c = 1 // C(cells, k)
  for (let k = 0; k <= cells; k++) {
    if (k > 0) c = (c * (cells - k + 1)) / k
    if (k < BONUS_MIN) continue
    const pk = c * p ** k * (1 - p) ** (cells - k)
    const w = winChance(k)
    mult += pk * w * multFor(Math.max(3, field.bestMatch))
    fixed += pk * (1 - w) * CONSOLATION_SPINS * lines
  }
  return { mult, fixed }
}

/** Частота бонуса (3+ папки) при текущей модели барабанов. */
export function bonusChance(field: Field): number {
  const i = field.model.symbols.indexOf(SCATTER)
  const p = i < 0 ? 0 : field.model.probs[i] / field.model.cum[field.model.cum.length - 1]
  const n = REELS * ROWS
  let below = 0
  let c = 1
  for (let k = 0; k < BONUS_MIN; k++) {
    if (k > 0) c = (c * (n - k + 1)) / k
    below += c * p ** k * (1 - p) ** (n - k)
  }
  return 1 - below
}

/** Масштаб на `lines` линиях по `spins` спинам. */
export function calibratePoint(field: Field, lines: number, spins: number, seed = 1): number {
  const rng = seededRng(seed)
  let mult = 0
  for (let i = 0; i < spins; i++) for (const w of spinField(field, lines, { rng }).wins) mult += multFor(w.matched.length)
  const b = bonusValue(field, lines)
  return payScaleFrom(mult / spins + b.mult, lines, b.fixed)
}

/** Детерминированный ГПСЧ, чтобы масштаб выплат не прыгал от раза к разу при тех же настройках. */
export function seededRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Средняя сумма множителей за спин на `lines` линиях (синхронно). */
export function meanMultPerSpin(field: Field, lines: number, spins = 200, seed = 1): number {
  const rng = seededRng(seed)
  let sum = 0
  for (let i = 0; i < spins; i++) for (const w of spinField(field, lines, { rng }).wins) sum += multFor(w.matched.length)
  return sum / spins
}

/** Полная таблица масштабов синхронно (для тестов и симуляции). */
export function payScaleTable(field: Field, spins = 200): Record<number, number> {
  const table: Record<number, number> = {}
  for (const l of CALIBRATION_LINES) table[l] = calibratePoint(field, l, l <= 4 ? spins * 4 : spins)
  return table
}

let worker: Worker | null | undefined
let jobId = 0

/**
 * Калибровка в фоне: в Web Worker, если он есть (интерфейс и 3D не тормозят), иначе — порциями
 * между кадрами. `onPoint` вызывается после каждой откалиброванной точки. Возвращает функцию отмены.
 */
export function calibratePayScale(field: Field, onPoint: (lines: number, scale: number) => void, spins = 200): () => void {
  if (worker === undefined) {
    try {
      worker = typeof Worker !== 'undefined' ? new Worker(new URL('./calibrate.worker.ts', import.meta.url), { type: 'module' }) : null
    } catch {
      worker = null
    }
  }
  if (!worker) return calibrateInChunks(field, onPoint, spins)
  const id = ++jobId
  const w = worker
  const onMessage = (e: MessageEvent<{ id: number; lines: number; scale: number }>) => {
    if (e.data.id === id) onPoint(e.data.lines, e.data.scale)
  }
  w.addEventListener('message', onMessage)
  // structured clone переносит и Set в группах кандидатов.
  w.postMessage({ id, field, spins })
  return () => w.removeEventListener('message', onMessage)
}

/**
 * Калибровка порциями между кадрами, чтобы не подвешивать интерфейс при смене навыков.
 * `onPoint` вызывается после каждой откалиброванной точки. Возвращает функцию отмены.
 */
function calibrateInChunks(field: Field, onPoint: (lines: number, scale: number) => void, spins = 200, chunk = 20): () => void {
  let cancelled = false
  // Сначала дешёвые точки — таблица быстро становится пригодной.
  const queue = [...CALIBRATION_LINES]
  let lines = queue.shift()!
  let rng = seededRng(1)
  let done = 0
  let sum = 0
  const step = () => {
    if (cancelled) return
    const cap = lines <= 4 ? spins * 4 : spins
    for (let i = 0; i < chunk * (lines <= 4 ? 4 : 1) && done < cap; i++, done++)
      for (const w of spinField(field, lines, { rng }).wins) sum += multFor(w.matched.length)
    const need = lines <= 4 ? spins * 4 : spins
    if (done >= need) {
      const b = bonusValue(field, lines)
      onPoint(lines, payScaleFrom(sum / need + b.mult, lines, b.fixed))
      if (!queue.length) return
      lines = queue.shift()!
      rng = seededRng(1)
      done = 0
      sum = 0
    }
    setTimeout(step, 0)
  }
  setTimeout(step, 0)
  return () => {
    cancelled = true
  }
}
