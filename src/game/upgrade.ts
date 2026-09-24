import type { Rng } from './outcome'
import type { Candidate } from './types'

/**
 * Мини-игра «Колесо торга» — цепочка попыток заменить выпавшего кандидата на кандидата со
 * следующим уровнем матча. Сами кандидаты никогда не меняются: при победе карточка целиком
 * заменяется на заранее и честно выбранного `next`.
 *
 *  • Колесо разбито на сектора вперемешку: зелёные «Подписал», жёлтые «Торгуется», красные «Ушёл».
 *    Площадь секторов = реальная вероятность: стрелка останавливается в равномерно случайной точке.
 *  • Зелёный — ступень пройдена: игрок получает кандидата N+1★ и решает прямо у колеса —
 *    ЗАБРАТЬ его или крутить дальше (колесо перестраивается под новый грейд).
 *  • Жёлтый — бесплатный респин на той же ступени.
 *  • Красный — кандидат уходит, и теряется ВСЁ, что набрано в цепочке (утешения нет).
 *  • Потолок — пока в пуле есть невыпадавший кандидат с матчем выше текущего, потом «★ Maximum».
 */

// ─── НАСТРОЙКИ ───────────────────────────────────────────────────────────────────────────────

/**
 * ИТОГОВЫЙ шанс пройти ступень (%) по числу звёзд ТЕКУЩЕГО кандидата — с учётом жёлтых респинов.
 * Единственное, что нужно менять; допустимо 0…100. Размеры секторов пересчитываются сами:
 * жёлтые всегда занимают PUSH_SHARE круга, зелёные/красные делят остальное в пропорции win : lose.
 *
 *   звёзды: победа за ступень (7★ → 8★ = 20% и т.д.)
 */
export const WIN_CHANCE: Record<number, number> = {
  3: 77,
  4: 65,
  5: 47,
  6: 28,
  7: 18,
  8: 9,
  9: 6,
  10: 4,
}

/** Доля круга под жёлтыми секторами «Торгуется» (бесплатный респин). */
export const PUSH_SHARE = 0.1
/** Всего секторов на колесе и сколько из них жёлтых (стоят напротив друг друга). */
export const SECTORS = 20
export const PUSH_SECTORS = 2
/** Длительность вращения колеса, мс (анимация + пауза перед результатом). */
export const WHEEL_SPIN_MS = 4200

// ─────────────────────────────────────────────────────────────────────────────────────────────

export type SectorKind = 'win' | 'push' | 'lose'

export interface Sector {
  kind: SectorKind
  /** Начало сектора — доля круга по часовой стрелке от верха (0…1). */
  start: number
  /** Размер сектора — доля круга. */
  size: number
}

export interface UpgradeGame {
  /** Карточка, с которой начали (исходный кандидат). */
  originId: string
  /** Кого игрок держит сейчас: исходный кандидат или последний выигранный. */
  holder: Candidate
  /** Предыдущий держатель (до последней победы) — чтобы подсветить новые навыки; null на старте. */
  prev: Candidate | null
  /** Звёзды матча holder — по ним берётся шанс ступени. */
  grade: number
  /** Цель следующей ступени (выбрана заранее и честно); null — выше в пуле никого, это максимум. */
  next: Candidate | null
  nextGrade: number | null
  /** Выигранные по цепочке кандидаты по порядку (последний = holder, если step > 0). */
  passed: Candidate[]
  /** Сколько ступеней пройдено. */
  step: number
  /** Грейды по цепочке: [исходный, после 1-й ступени, …] — для «лесенки» на табло. */
  path: number[]
  sectors: Sector[]
  /** Счётчик вращений — UI по нему узнаёт новый спин. */
  spins: number
  /** Точка остановки последнего вращения (доля круга под стрелкой); null — ещё не крутили. */
  landAt: number | null
  /** Итог последнего вращения. */
  last: SectorKind | null
  /** ready — ждём решения, spinning — колесо крутится, lost — всё потеряно, max — потолок. */
  status: 'ready' | 'spinning' | 'lost' | 'max'
}

/** Итоговый шанс ступени (доля 0…1): из таблицы, для отсутствующего грейда — ближайший заданный. */
export function winChance(grade: number): number {
  const keys = Object.keys(WIN_CHANCE).map(Number).sort((a, b) => a - b)
  const key = keys.reduce((best, k) => (Math.abs(k - grade) < Math.abs(best - grade) ? k : best), keys[0])
  return Math.min(100, Math.max(0, WIN_CHANCE[key])) / 100
}

/** Шансы (%) для грейда: итог за ступень и доли на одном вращении. */
export function chancesFor(grade: number) {
  const w = winChance(grade)
  const p = w <= 0 || w >= 1 ? 0 : PUSH_SHARE
  return { win: w * 100, spin: { win: w * (1 - p) * 100, push: p * 100, lose: (1 - w) * (1 - p) * 100 } }
}

/**
 * Колесо для грейда. Зелёные рассыпаны по красным равномерно (алгоритм Брезенхэма) со случайным
 * сдвигом, жёлтые — напротив друг друга. Размеры подобраны так, что суммарная площадь зелёных
 * = win·(1−push), красных = lose·(1−push): итоговый шанс с учётом респинов ровно = WIN_CHANCE.
 */
export function buildWheel(grade: number, rng: Rng = Math.random): Sector[] {
  const w = winChance(grade)
  // При 0% или 100% жёлтые бессмысленны — колесо из одного цвета.
  const pushN = w <= 0 || w >= 1 ? 0 : PUSH_SECTORS
  const p = pushN ? PUSH_SHARE : 0
  const slots = SECTORS - pushN
  const g = w <= 0 ? 0 : w >= 1 ? slots : Math.min(slots - 1, Math.max(1, Math.round(w * slots)))
  const r = slots - g
  const winSize = g ? (w * (1 - p)) / g : 0
  const loseSize = r ? ((1 - w) * (1 - p)) / r : 0
  const pushSize = pushN ? p / pushN : 0

  const pattern: SectorKind[] = Array.from({ length: slots }, (_, i) => (Math.floor(((i + 1) * g) / slots) > Math.floor((i * g) / slots) ? 'win' : 'lose'))
  const shift = Math.floor(rng() * slots)
  const kinds: SectorKind[] = []
  for (let i = 0; i < slots; i++) {
    if (pushN && i % (slots / pushN) === 0) kinds.push('push')
    kinds.push(pattern[(i + shift) % slots])
  }
  const sizeOf = (k: SectorKind) => (k === 'win' ? winSize : k === 'lose' ? loseSize : pushSize)
  let start = 0
  return kinds.map((kind) => {
    const s = { kind, start, size: sizeOf(kind) }
    start += s.size
    return s
  })
}

/** Какой сектор под стрелкой при остановке в точке u (доля круга). */
export function sectorAt(sectors: Sector[], u: number): Sector {
  const x = ((u % 1) + 1) % 1
  for (const s of sectors) if (x >= s.start && x < s.start + s.size) return s
  return sectors[sectors.length - 1]
}

export function newUpgrade(holder: Candidate, grade: number, next: Candidate, nextGrade: number, rng: Rng = Math.random): UpgradeGame {
  return {
    originId: holder.id,
    holder,
    prev: null,
    grade,
    next,
    nextGrade,
    passed: [],
    step: 0,
    path: [grade],
    sectors: buildWheel(grade, rng),
    spins: 0,
    landAt: null,
    last: null,
    status: 'ready',
  }
}

/** Запустить колесо: точка остановки выбирается сразу (равномерно по кругу), UI доводит до неё. */
export function spinWheel(g: UpgradeGame, rng: Rng = Math.random): UpgradeGame {
  if (g.status !== 'ready' || !g.next) return g
  return { ...g, status: 'spinning', landAt: rng(), spins: g.spins + 1, last: null }
}

/** Итог уже запущенного вращения. */
export const spinOutcome = (g: UpgradeGame): SectorKind | null => (g.landAt == null ? null : sectorAt(g.sectors, g.landAt).kind)

/**
 * Колесо остановилось — применить итог. `pickNext(holder, grade)` подбирает цель следующей ступени
 * для нового держателя (или null — выше никого, потолок).
 */
export function settleSpin(
  g: UpgradeGame,
  pickNext: (holder: Candidate, grade: number, passed: Candidate[]) => { candidate: Candidate; grade: number } | null,
  rng: Rng = Math.random,
): UpgradeGame {
  if (g.status !== 'spinning') return g
  const kind = spinOutcome(g)
  if (kind === 'push') return { ...g, status: 'ready', last: 'push' }
  if (kind === 'lose' || !g.next || g.nextGrade == null) return { ...g, status: 'lost', last: 'lose' }
  const holder = g.next
  const grade = g.nextGrade
  const passed = [...g.passed, holder]
  const nx = pickNext(holder, grade, passed)
  return {
    ...g,
    holder,
    prev: g.holder,
    grade,
    passed,
    step: g.step + 1,
    path: [...g.path, grade],
    next: nx?.candidate ?? null,
    nextGrade: nx?.grade ?? null,
    sectors: nx ? buildWheel(grade, rng) : g.sectors,
    last: 'win',
    status: nx ? 'ready' : 'max',
  }
}
