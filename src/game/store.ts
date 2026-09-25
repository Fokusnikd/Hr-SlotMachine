import { create } from 'zustand'
import type { Candidate, CandidateSource, Rarity, SkillId, SpinResult } from './types'
import { BASE_SKILLS, buildField, describeLines, linesFor, MAX_LINES, MAX_SKILLS, MIN_MATCH, MIN_SKILLS, minLinesFor, REELS, spinField, topSkills, type Field, type Payline } from './outcome'
import { payoutFor, plural, REFILL_AMOUNT, scaleForLines, spinCost, START_CREDITS } from './economy'
import { calibratePayScale } from './calibrate'
import { load, save } from './persist'
import { assignFx, type FxId } from './fx'
import { getSkill, normalizeSkill } from './skills'
import { makeMockCandidates } from '../data/mockCandidates'
import { loadDatabase } from '../data/db'
import { bestCandidate, CONSOLATION_SPINS, HIRES_TO_WIN, newBonus, openFolder as openBonusFolder, REJECTS_TO_LOSE, type BonusGame } from './bonus'
import { rarityInPool, SCATTER } from './outcome'
import { MSG, say, WHEEL } from '../copy'
import { chancesFor, newUpgrade, settleSpin, spinWheel as spinUpgradeWheel, WHEEL_SPIN_MS, type UpgradeGame } from './upgrade'

export type Phase = 'idle' | 'spinning' | 'win' | 'bonus' | 'upgrade'
export type SourceFilter = 'all' | Exclude<CandidateSource, 'mock'>

export interface Settings {
  source: SourceFilter
  /** Фильтр через запятую: навыки («react, docker»), город, слова из должности. Условия объединяются через И. */
  filter: string
  /** Выбранные навыки позиции (3–10). Пусто — берём топ-5 позиции. */
  skills: SkillId[]
  /** Сколько линий выплат играет (линии 1…N по порядку). Не меньше минимума для числа навыков. */
  lines: number
  /** Общий звук: false — mute (громкости ползунков при этом сохраняются). */
  sound: boolean
  /** Общая громкость, 0..1. */
  masterVol: number
  /** Громкость музыки и фона, 0..1. */
  musicVol: number
  /** Громкость эффектов и интерфейса, 0..1. */
  sfxVol: number
  /** Анимации совпавших слотов. */
  fx: boolean
}

export interface DbInfo {
  status: 'loading' | 'ready' | 'demo'
  generatedAt?: string
  counts: Record<SourceFilter, number>
}

/** Счётчики пула для табло. */
export interface PoolInfo {
  /** Все кандидаты под фильтром (источник + фильтр). */
  total: number
  /** Ещё не выпадавшие, у кого есть 3+ выбранных навыка, — только они могут выпасть. */
  eligible: number
  /** Уже выпадали (шорт-лист или обмен) — повторно не выпадут. */
  seen: number
}

interface State {
  credits: number
  phase: Phase
  spinId: number
  stoppedReels: number
  result: SpinResult | null
  message: string

  all: Candidate[]
  /** Весь пул под фильтром — все эти люди участвуют в каждом спине. */
  filtered: Candidate[]
  poolInfo: PoolInfo
  /** Максимум совпадений с выбранными навыками во всём пуле под фильтром — это уровень UNICORN. */
  poolMax: number
  /** Модель барабанов и группы кандидатов под текущие навыки. */
  field: Field | null
  /** Масштаб выплат для текущего числа линий (калибруется симуляцией под навыки, пул и линии). */
  payScale: number
  /** Откалиброванные точки: число линий → масштаб. */
  payTable: Record<number, number>
  /** Масштаб выплат, зафиксированный в момент спина (линии можно поменять, пока разбираешь выигрыш). */
  winScale: number
  /** Какой из выигрышей спина сейчас «на руках» (0…wins.length). */
  winIndex: number
  /** Алфавит барабанов — топ-навыки позиции (+ выбранные). */
  pool: SkillId[]
  /** Навыки позиции с числом кандидатов — для выбора в настройках. */
  roleSkills: { id: SkillId; count: number }[]
  /** Выбранные навыки, по которым считаются совпадения. */
  targets: SkillId[]
  lines: Payline[]
  cost: number
  /** Когда (performance.now) последний раз менялось число линий — линии ненадолго показываются. */
  linesChangedAt: number
  /** Автозапуск: крутит сам, пока не выпадет кандидат или не кончатся кредиты. */
  auto: boolean
  /** Счётчик попыток спина без денег — UI открывает по нему окно «Пополнить». */
  brokeAttempts: number
  /** Анимация каждого навыка позиции (раздаётся при выборе «кого ищем»). */
  skillFx: Record<SkillId, FxId>
  /** Когда (performance.now) выпал текущий выигрыш — отсчёт анимаций слотов. */
  winAt: number
  /** Открыта ли карточка выпавшего кандидата (сама не открывается — кнопкой «Открыть»). */
  winOpen: boolean
  db: DbInfo
  /** Миниигра «Золотая папка» (фаза bonus). */
  bonus: BonusGame | null
  /** Когда (performance.now) началась миниигра — для анимации появления. */
  bonusAt: number
  /** Выпал бонус — миниигра запустится после паузы на переворот папок (число папок).
   *  Кандидаты по линиям этого спина ждут в result.wins и показываются уже после бонуса. */
  pendingBonus: number
  /** Утешительный приз текущего бонуса, кредиты. */
  bonusConsolation: number
  /** Приз выигранной миниигры — покажется как обычный выигрыш после анимации. */
  bonusPrize: SpinResult | null

  /** Миниигра «Колесо торга» (фаза upgrade) — цепочка замен текущего выигрыша на кандидатов со
   *  следующим уровнем матча; сами кандидаты не меняются, апгрейдится карточка целиком. */
  upgrade: UpgradeGame | null
  /** Когда (performance.now) началась миниигра улучшения — для анимации появления. */
  upgradeAt: number
  /** Какие выигрыши текущего спина уже прошли через колесо торга (winIndex → true), одна цепочка на карточку. */
  upgradeApplied: Record<number, boolean>

  excluded: string[]
  shortlist: Candidate[]
  stats: { spins: number; wins: number; exchanged: number }
  settings: Settings

  init: () => Promise<void>
  /** Запустить спин. false — если нельзя (идёт спин, нет кредитов, нет кандидатов). */
  spin: () => boolean
  reelStopped: (index: number) => void
  exchange: () => void
  keep: () => void
  /** Пополнить кредиты (по умолчанию на REFILL_AMOUNT). */
  refill: (amount?: number) => void
  removeFromShortlist: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  /** Добавить (+1) или убрать (−1) линию прямо с экрана машины. */
  changeLines: (delta: number) => void
  /** Выбрать число линий кнопкой-пресетом. */
  setLines: (count: number) => void
  toggleAuto: () => void
  openWin: () => void
  closeWin: () => void
  resetProgress: () => void
  /** Открыть папку в миниигре. */
  openFolder: (index: number) => void
  /** Закончить миниигру (после показа результата): приз → карточка кандидата, проигрыш → к спинам. */
  finishBonus: () => void
  /** Запустить «Колесо торга» для текущего выигрыша (одна цепочка на карточку). */
  startUpgrade: () => void
  /** Крутить колесо торга (следующая ступень или респин после жёлтого сектора). */
  spinWheel: () => void
  /** Забрать текущего держателя цепочки (на нулевой ступени — отказаться от торга без потерь). */
  takeUpgrade: () => void
  /** Закончить проигранную цепочку: кандидат и всё набранное потеряны. */
  finishUpgrade: () => void
}

export const DEFAULT_MASTER_VOL = 1
export const DEFAULT_MUSIC_VOL = 0.7
export const DEFAULT_SFX_VOL = 0.8

/**
 * Миграция сохранённых настроек (hrgacha:settings.v3): до реворка звука был только тумблер `sound`.
 * Он остаётся общим mute; громкости, если их нет или они битые, получают значения по умолчанию.
 */
export function migrateSettings(raw: Partial<Settings> | null | undefined): Partial<Settings> {
  const src = raw && typeof raw === 'object' ? raw : {}
  const vol = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d)
  return {
    ...src,
    ...(typeof src.sound === 'boolean' ? {} : { sound: true }),
    masterVol: vol(src.masterVol, DEFAULT_MASTER_VOL),
    musicVol: vol(src.musicVol, DEFAULT_MUSIC_VOL),
    sfxVol: vol(src.sfxVol, DEFAULT_SFX_VOL),
  }
}

const initialSettings: Settings = {
  source: 'all',
  filter: '',
  skills: [],
  lines: 1,
  sound: true,
  masterVol: DEFAULT_MASTER_VOL,
  musicVol: DEFAULT_MUSIC_VOL,
  sfxVol: DEFAULT_SFX_VOL,
  fx: typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  ...migrateSettings({ ...load<Partial<Settings>>('settings.v2', {}), ...load<Partial<Settings>>('settings.v3', {}) }),
}

export const ROLE_SKILLS = 20

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, legendary: 2 }

/** Навыки позиции: топ-20 среди кандидатов, подходящих под фильтр. */
export function roleSkillsFor(all: Candidate[], settings: Pick<Settings, 'source' | 'filter'>) {
  return topSkills(applyFilter(all, settings), ROLE_SKILLS)
}

/** Выбор по умолчанию — топ-5 позиции. */
export const defaultSkills = (role: { id: SkillId }[]) => role.slice(0, BASE_SKILLS).map((s) => s.id)

/** Приводим выбор к списку позиции; если осталось меньше 3 — берём топ-5. */
export function resolveSkills(selected: SkillId[], role: { id: SkillId }[]): SkillId[] {
  const ids = new Set(role.map((s) => s.id))
  const kept = [...new Set(selected)].filter((s) => ids.has(s)).slice(0, MAX_SKILLS)
  return kept.length >= MIN_SKILLS ? kept : defaultSkills(role)
}

/** Число линий с учётом минимума для выбранного числа навыков. */
export const resolveLines = (lines: number | undefined, skillCount: number) =>
  Math.min(MAX_LINES, Math.max(minLinesFor(skillCount), Math.round(lines ?? 1)))

/** Сколько разных навыков из набора есть у кандидата. */
export const countTargets = (c: Candidate, targets: ReadonlySet<SkillId>) => new Set(c.skills.filter((s) => targets.has(s))).size

/** Кандидаты пула для миниигры «Переговоры об оффере»: ещё не выпадавшие, не текущий кандидат,
 *  со СЛЕДУЮЩИМ уровнем матча — наименьшим из тех, что выше `current` (обычно current + 1).
 *  Пусто — выше этого грейда в пуле никого нет (максимум). Апгрейдится карточка, а не кандидат. */
export function upgradeCandidates(filtered: Candidate[], targets: SkillId[], excluded: ReadonlySet<string>, currentId: string, current: number): Candidate[] {
  const t = new Set(targets)
  let next = Infinity
  let list: Candidate[] = []
  for (const c of filtered) {
    if (c.id === currentId || excluded.has(c.id)) continue
    const n = countTargets(c, t)
    if (n <= current || n > next) continue
    if (n < next) ((next = n), (list = []))
    list.push(c)
  }
  return list
}

/** Кандидаты позиции, у которых есть хотя бы 3 выбранных навыка — только они могут выпасть. */
export function playable(all: Candidate[], settings: Pick<Settings, 'source' | 'filter'>, skills: SkillId[]) {
  const t = new Set(skills)
  return applyFilter(all, settings).filter((c) => countTargets(c, t) >= MIN_MATCH)
}

export function poolInfoFor(filtered: Candidate[], targets: SkillId[], excluded: ReadonlySet<string>): PoolInfo {
  const t = new Set(targets)
  let eligible = 0
  let seen = 0
  for (const c of filtered) {
    if (excluded.has(c.id)) seen++
    else if (countTargets(c, t) >= MIN_MATCH) eligible++
  }
  return { total: filtered.length, eligible, seen }
}

/** Максимум совпадений с выбранными навыками во всём пуле под фильтром (включая уже выпадавших):
 *  стабилен в течение игры и задаёт шкалу уровней — UNICORN = этот максимум. */
export function poolMaxFor(filtered: Candidate[], targets: SkillId[]): number {
  const t = new Set(targets)
  let max = 0
  for (const c of filtered) max = Math.max(max, countTargets(c, t))
  return max
}

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'legendary']

/** Пересчитать уровни выигрышей спина относительно максимума пула (spinField считает по абсолютной шкале). */
export function withPoolRarity(r: SpinResult, poolMax: number): SpinResult {
  if (!r.wins.length) return r
  const wins = r.wins.map((w) => ({ ...w, rarity: rarityInPool(w.matched.length, poolMax) ?? w.rarity }))
  const rarity = wins.reduce<Rarity>((best, w) => (RARITY_ORDER.indexOf(w.rarity) > RARITY_ORDER.indexOf(best) ? w.rarity : best), 'common')
  return { ...r, wins, rarity }
}

function haystack(c: Candidate) {
  return [c.name, c.title, c.location, c.company, c.bio].filter(Boolean).join(' ').toLowerCase()
}

export function parseFilter(filter: string) {
  return filter
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ raw: t, skill: normalizeSkill(t) }))
}

export function applyFilter(all: Candidate[], settings: Pick<Settings, 'source' | 'filter'>): Candidate[] {
  let list = settings.source === 'all' ? all : all.filter((c) => c.source === settings.source)
  for (const term of parseFilter(settings.filter)) {
    const needle = term.raw.toLowerCase()
    list = list.filter((c) => (term.skill ? c.skills.includes(term.skill) : haystack(c).includes(needle)))
  }
  return list
}

export function describeFilter(filter: string): string {
  return parseFilter(filter)
    .map((t) => (t.skill ? getSkill(t.skill).label : t.raw))
    .join(' + ')
}

export const useGame = create<State>((set, get) => {
  const persist = () => {
    const s = get()
    save('credits', s.credits)
    save('excluded', s.excluded)
    save('shortlist', s.shortlist)
    save('stats', s.stats)
    save('settings.v3', s.settings)
  }

  let cancelCalibration = () => {}

  /** Пересчитать фильтр → навыки позиции → пул → модель барабанов, линии и масштаб выплат. */
  const rebuild = (opts: { field?: boolean } = { field: true }) => {
    const { all, excluded } = get()
    let { settings } = get()
    const roleSkills = roleSkillsFor(all, settings)
    const targets = resolveSkills(settings.skills, roleSkills)
    const lineCount = resolveLines(settings.lines, targets.length)
    if (targets.join() !== settings.skills.join() || lineCount !== settings.lines) settings = { ...settings, skills: targets, lines: lineCount }
    const filtered = applyFilter(all, settings)
    const pool = [...new Set([...roleSkills.map((s) => s.id), ...targets])]
    const changed = get().lines.length !== lineCount
    const rebuildField = opts.field || !get().field
    set({
      settings,
      filtered,
      poolInfo: poolInfoFor(filtered, targets, new Set(excluded)),
      poolMax: poolMaxFor(filtered, targets),
      pool,
      roleSkills,
      targets,
      skillFx: assignFx(pool, `${settings.source}|${settings.filter.trim().toLowerCase()}`),
      lines: linesFor(lineCount),
      cost: spinCost(lineCount),
      ...(changed ? { linesChangedAt: performance.now() } : {}),
    })
    if (rebuildField) {
      const field = buildField(filtered, targets, pool)
      set({ field, payTable: {} })
      cancelCalibration()
      cancelCalibration = calibratePayScale(field, (lines, scale) => {
        const payTable = { ...get().payTable, [lines]: scale }
        set({ payTable, payScale: scaleForLines(payTable, get().lines.length) })
      })
    } else set({ payScale: scaleForLines(get().payTable, lineCount) })
  }

  const refreshPool = () => {
    const { filtered, targets, excluded } = get()
    set({ poolInfo: poolInfoFor(filtered, targets, new Set(excluded)) })
  }

  /** Текущий (ещё не разобранный) выигрыш спина. */
  const currentWin = () => {
    const s = get()
    return s.phase === 'win' ? s.result?.wins[s.winIndex] ?? null : null
  }

  /** Разобрали выигрыш — переходим к следующему или заканчиваем. */
  const advance = (note: string) => {
    const s = get()
    const next = s.winIndex + 1
    const left = (s.result?.wins.length ?? 0) - next
    if (left > 0) {
      const w = s.result!.wins[next]
      set({ winIndex: next, message: MSG.nextUp(note, left, w.candidate.name, w.matched.length) })
    } else {
      set({ winIndex: next })
      afterWins(note)
    }
  }

  const bonusStatus = (g: BonusGame) => {
    const shields = g.shields - g.blocked.length
    return MSG.bonusStatus({ hires: g.hires, needHires: HIRES_TO_WIN, rejects: g.rejects, maxRejects: REJECTS_TO_LOSE, shields: g.shields ? MSG.bonusShieldsLeft(shields, g.shields) : '' })
  }

  let finishTimer: ReturnType<typeof setTimeout> | undefined
  let upgradeTimer: ReturnType<typeof setTimeout> | undefined

  /** Цель следующей ступени колеса торга: невыпадавший кандидат со следующим уровнем матча выше
   *  `grade`, не исходный и не пройденный по цепочке. null — выше никого, это потолок. */
  const pickUpgradeTarget = (holder: Candidate, grade: number, passed: Candidate[]) => {
    const s = get()
    const g = s.upgrade
    // Кандидаты, ждущие своей очереди в этом же спине, тоже не годятся в цели — иначе дубль.
    const waiting = s.result?.wins.map((w) => w.candidate.id) ?? []
    const skip = new Set([...s.excluded, ...waiting, ...(g ? [g.originId] : []), ...passed.map((c) => c.id)])
    const pool = upgradeCandidates(s.filtered, s.targets, skip, holder.id, grade)
    if (!pool.length) return null
    const candidate = pool[Math.floor(Math.random() * pool.length)]
    const skills = matchedSkills(candidate)
    return { candidate, grade: skills.length, skills }
  }

  const wheelOdds = (g: UpgradeGame) => WHEEL.odds(Math.round(chancesFor(g.grade).win))

  /** Совпавшие навыки кандидата (id, без повторов) — на колесе показываем их, а не имена людей. */
  const matchedSkills = (c: Candidate) => {
    const t = new Set(get().targets)
    return [...new Set(c.skills.filter((sk) => t.has(sk)))]
  }
  /** Навыки, которые добавила последняя победа по сравнению с предыдущим держателем. */
  const freshSkills = (g: UpgradeGame) => {
    const before = new Set(g.prevSkills ?? [])
    return g.skills
      .filter((sk) => !before.has(sk))
      .map((sk) => getSkill(sk).label)
  }

  /** Колесо остановилось — применяем итог и пишем на табло. */
  const settleWheel = () => {
    const s = get()
    if (s.phase !== 'upgrade' || !s.upgrade || s.upgrade.status !== 'spinning') return
    const g = settleSpin(s.upgrade, pickUpgradeTarget)
    let message: string
    if (g.last === 'push') message = say(MSG.push, { from: g.grade, to: g.nextGrade, odds: wheelOdds(g) })
    else if (g.status === 'lost') message = say(MSG.lost, g.step ? MSG.lostChain(g.step) : '')
    else {
      const fresh = freshSkills(g)
      const plus = fresh.length ? ` +${fresh.join(', +')}` : ''
      message =
        g.status === 'max'
          ? say(g.grade >= get().poolMax ? MSG.signedUnicorn : MSG.signedMaxLeft, g.grade, plus)
          : say(MSG.signed, { from: g.grade, to: g.nextGrade, odds: wheelOdds(g), plus })
    }
    set({ upgrade: g, message })
    if (g.status === 'lost') {
      upgradeTimer = setTimeout(() => {
        if (get().phase === 'upgrade' && get().upgrade === g) get().finishUpgrade()
      }, 2200)
    }
    persist()
  }

  /** Запуск миниигры: барабаны уезжают, в окне — 12 папок. */
  const startBonus = (scatters: number) => {
    const s = get()
    const bonus = newBonus(scatters)
    set({
      phase: 'bonus',
      auto: false,
      winOpen: false,
      bonus,
      bonusAt: performance.now(),
      pendingBonus: 0,
      bonusConsolation: CONSOLATION_SPINS * spinCost(s.result?.lines.length ?? s.lines.length),
      message: say(MSG.bonusStart, scatters) + (bonus.shields ? MSG.bonusShields(bonus.shields) : ''),
    })
  }

  /** Все кандидаты спина разобраны — обратно к спинам (бонус к этому моменту уже сыгран). */
  const afterWins = (note: string) => set({ phase: 'idle', winOpen: false, message: note })

  /** Текст про выпавших по линиям кандидатов. */
  const winsText = (r: SpinResult, scale: number) => {
    const n = r.wins.length
    const total = r.wins.reduce((a, w) => a + payoutFor(w.matched.length, scale), 0)
    const w = r.wins[0]
    return n === 1
      ? say(MSG.winOne, {
          skills: `${w.matched.length} ${plural(w.matched.length, 'skill', 'skills', 'skills')}`,
          where: `${w.lineIds.length > 1 ? 'lines' : 'line'} ${describeLines(w.lineIds)}`,
          name: w.candidate.name,
          total,
        })
      : say(MSG.winMany, { people: `${n} ${plural(n, 'person', 'people', 'people')}`, best: w.matched.length, name: w.candidate.name, total })
  }

  const markUsed = (c: Candidate) => {
    set({ excluded: [...get().excluded, c.id] })
    refreshPool()
  }

  const demo = makeMockCandidates()

  return {
    credits: load('credits', START_CREDITS),
    phase: 'idle',
    spinId: 0,
    stoppedReels: 0,
    result: null,
    message: say(MSG.loading),

    all: [],
    filtered: [],
    poolInfo: { total: 0, eligible: 0, seen: 0 },
    poolMax: 0,
    field: null,
    payScale: 4,
    payTable: {},
    winIndex: 0,
    winScale: 4,
    pool: topSkills(demo, ROLE_SKILLS).map((s) => s.id),
    roleSkills: [],
    targets: [],
    lines: linesFor(1),
    cost: spinCost(1),
    linesChangedAt: -1e9,
    auto: false,
    brokeAttempts: 0,
    winOpen: false,
    skillFx: {},
    winAt: 0,
    db: { status: 'loading', counts: { all: 0, jsonresume: 0, github: 0 } },
    bonus: null,
    bonusAt: 0,
    pendingBonus: 0,
    bonusConsolation: 0,
    bonusPrize: null,
    upgrade: null,
    upgradeAt: 0,
    upgradeApplied: {},

    excluded: load<string[]>('excluded', []),
    shortlist: load<Candidate[]>('shortlist', []),
    stats: load('stats', { spins: 0, wins: 0, exchanged: 0 }),
    settings: initialSettings,

    init: async () => {
      if (get().db.status !== 'loading' || get().all.length) return
      const db = await loadDatabase()
      if (db && db.candidates.length >= 10) {
        set({
          all: db.candidates,
          db: {
            status: 'ready',
            generatedAt: db.generatedAt,
            counts: { all: db.candidates.length, jsonresume: db.counts.jsonresume, github: db.counts.github },
          },
          message: say(MSG.ready),
        })
      } else {
        set({
          all: demo,
          settings: { ...get().settings, source: 'all' },
          db: { status: 'demo', counts: { all: demo.length, jsonresume: 0, github: 0 } },
          message: MSG.demo,
        })
      }
      rebuild()
      if (!get().poolInfo.eligible) set({ message: say(MSG.noMatch) })
    },

    spin: () => {
      let s = get()
      if (s.phase === 'spinning' || s.db.status === 'loading' || !s.field) return false
      // Во время миниигры ЗАПУСК/пробел только закрывают показанный результат.
      if (s.phase === 'bonus') {
        if (s.bonus && s.bonus.status !== 'play') get().finishBonus()
        return false
      }
      if (s.phase === 'upgrade') {
        const st = s.upgrade?.status
        if (st === 'ready') get().spinWheel()
        else if (st === 'max') get().takeUpgrade()
        else if (st === 'lost') get().finishUpgrade()
        return false
      }
      // Неразобранные кандидаты при новом спине автоматически обмениваются на кредиты.
      let exchangedNote = ''
      if (s.phase === 'win' && s.result) {
        const left = s.result.wins.slice(s.winIndex)
        const gain = left.reduce((a, w) => a + payoutFor(w.matched.length, s.winScale), 0)
        exchangedNote = MSG.autoExchanged(left.length > 1 ? `${left.length} ${plural(left.length, 'person', 'people', 'people')}` : left[0].candidate.name, gain)
        set({
          credits: s.credits + gain,
          excluded: [...s.excluded, ...left.map((w) => w.candidate.id)],
          phase: 'idle',
          winOpen: false,
          winIndex: s.result.wins.length,
          stats: { ...s.stats, exchanged: s.stats.exchanged + left.length },
        })
        refreshPool()
        s = get()
      }
      if (s.phase !== 'idle') return false
      if (s.credits < s.cost) {
        set({ auto: false, brokeAttempts: s.brokeAttempts + 1, message: say(MSG.outOfCredits) })
        return false
      }
      if (!s.poolInfo.eligible) {
        set({ auto: false, message: say(MSG.poolDrained) })
        return false
      }
      const result = withPoolRarity(spinField(s.field!, s.lines.length, { exclude: new Set(s.excluded) }), s.poolMax)
      set({
        credits: s.credits - s.cost,
        phase: 'spinning',
        spinId: s.spinId + 1,
        stoppedReels: 0,
        result,
        winScale: s.payScale,
        winIndex: 0,
        winOpen: false,
        pendingBonus: 0,
        bonus: null,
        upgradeApplied: {},
        message: exchangedNote + say(s.auto ? MSG.autoSpinning : MSG.spinning),
        stats: { ...s.stats, spins: s.stats.spins + 1 },
      })
      persist()
      return true
    },

    reelStopped: () => {
      const s = get()
      if (s.phase !== 'spinning') return
      const stopped = s.stoppedReels + 1
      if (stopped < REELS) {
        set({ stoppedReels: stopped })
        return
      }
      const r = s.result!
      const n = r.wins.length
      if (r.bonus) {
        // Бонус — первым: кандидаты по линиям ждут в result.wins и покажутся после миниигры.
        // Автозапуск останавливается: миниигра требует кликов игрока.
        const waiting = n ? MSG.bonusWaiting(`${n} ${plural(n, 'candidate', 'candidates', 'candidates')}`, n > 1 ? 'are' : 'is') : ''
        set({
          auto: false,
          pendingBonus: r.bonus,
          stoppedReels: stopped,
          message: MSG.bonusIncoming(r.bonus, waiting),
          ...(n ? { stats: { ...s.stats, wins: s.stats.wins + n } } : {}),
        })
        // Пауза: папки на барабанах успевают перевернуться на «ПРИНЯТ».
        setTimeout(() => {
          const now = get()
          if (now.phase === 'spinning' && now.pendingBonus) startBonus(now.pendingBonus)
        }, 2600)
      } else if (n) {
        // Автозапуск останавливается на кандидате.
        set({ auto: false, winAt: performance.now(), stoppedReels: stopped, phase: 'win', winIndex: 0, message: winsText(r, s.winScale), stats: { ...s.stats, wins: s.stats.wins + n } })
      } else if (r.nearMiss) {
        set({ stoppedReels: stopped, phase: 'idle', message: say(MSG.nearMiss, r.nearMiss.candidate.name) })
      } else {
        set({ stoppedReels: stopped, phase: 'idle', message: say(MSG.miss) })
      }
      persist()
      if (!n && get().auto) {
        setTimeout(() => {
          const now = get()
          if (now.auto && now.phase === 'idle' && !now.spin()) set({ auto: false })
        }, 650)
      }
    },

    exchange: () => {
      const s = get()
      const w = currentWin()
      if (!w) return
      const gain = payoutFor(w.matched.length, s.winScale)
      set({ credits: s.credits + gain, stats: { ...s.stats, exchanged: s.stats.exchanged + 1 } })
      markUsed(w.candidate)
      advance(say(MSG.exchange, w.candidate.name, gain))
      persist()
    },

    keep: () => {
      const s = get()
      const w = currentWin()
      if (!w) return
      const already = s.shortlist.some((c) => c.id === w.candidate.id)
      set({ shortlist: already ? s.shortlist : [w.candidate, ...s.shortlist] })
      markUsed(w.candidate)
      advance(say(MSG.keep, w.candidate.name))
      persist()
    },
    refill: (amount = REFILL_AMOUNT) => {
      set((s) => ({ credits: s.credits + amount, message: say(MSG.refill, amount) }))
      persist()
    },

    removeFromShortlist: (id) => {
      set((s) => ({ shortlist: s.shortlist.filter((c) => c.id !== id) }))
      persist()
    },

    updateSettings: (patch) => {
      const prev = get().settings
      const settings = { ...prev, ...patch }
      set({ settings })
      persist()
      const onlyLines = settings.source === prev.source && settings.filter === prev.filter && settings.skills.join() === prev.skills.join()
      if (onlyLines && settings.lines !== prev.lines) {
        // Смена числа линий не трогает модель барабанов — только линии и цену спина.
        rebuild({ field: false })
        persist()
        return
      }
      if (!onlyLines) {
        rebuild()
        persist()
        const { poolInfo, targets, lines, cost } = get()
        set({
          message: poolInfo.eligible
            ? MSG.poolSummary({
                total: poolInfo.total,
                eligible: poolInfo.eligible,
                skills: `${targets.length} ${plural(targets.length, 'skill', 'skills', 'skills')}`,
                lines: `${lines.length} ${plural(lines.length, 'line', 'lines', 'lines')}`,
                cost,
              })
            : say(MSG.noMatch),
        })
      }
    },

    setLines: (count) => {
      const s = get()
      if (s.phase === 'spinning' || s.phase === 'bonus' || s.phase === 'upgrade') return
      const min = minLinesFor(s.targets.length)
      if (count < min) {
        set({ message: MSG.minLines(`${s.targets.length} ${plural(s.targets.length, 'skill', 'skills', 'skills')}`, `${min} ${plural(min, 'line', 'lines', 'lines')}`) })
        return
      }
      const next = Math.min(MAX_LINES, count)
      if (next !== s.lines.length) get().updateSettings({ lines: next })
      else set({ linesChangedAt: performance.now() })
      set({ message: MSG.linesSet(`${next} ${plural(next, 'line', 'lines', 'lines')}`, get().cost) })
    },

    toggleAuto: () => {
      const s = get()
      if (s.auto) {
        set({ auto: false, message: say(MSG.autoStopped) })
        return
      }
      set({ auto: true })
      if (s.phase !== 'spinning' && !get().spin()) set({ auto: false })
    },

    openWin: () => {
      if (currentWin()) set({ winOpen: true })
    },

    closeWin: () => set({ winOpen: false }),

    changeLines: (delta) => {
      const s = get()
      if (s.phase === 'spinning' || s.phase === 'bonus' || s.phase === 'upgrade') return
      const min = minLinesFor(s.targets.length)
      const next = Math.min(MAX_LINES, Math.max(min, s.lines.length + delta))
      if (next === s.lines.length) {
        set({ linesChangedAt: performance.now() })
        if (delta < 0) set({ message: MSG.minLines(`${s.targets.length} ${plural(s.targets.length, 'skill', 'skills', 'skills')}`, `${min} ${plural(min, 'line', 'lines', 'lines')}`) })
        return
      }
      get().updateSettings({ lines: next })
      const { cost } = get()
      set({ message: MSG.linesSet(`${next} ${plural(next, 'line', 'lines', 'lines')}`, cost) })
    },

    openFolder: (index) => {
      const s = get()
      if (s.phase !== 'bonus' || !s.bonus) return
      if (s.bonus.status !== 'play') return get().finishBonus()
      const g = openBonusFolder(s.bonus, index)
      if (g === s.bonus) return
      const f = g.board[index]
      const note = say(f === 'hire' ? MSG.folderMatch : f === 'empty' ? MSG.folderEmpty : g.blocked.includes(index) ? MSG.folderShield : MSG.folderMiss)
      if (g.status === 'play') {
        set({ bonus: g, message: `${note} ${bonusStatus(g)}` })
        return
      }
      if (g.status === 'won') {
        const r = s.result!
        // Кандидаты по линиям этого спина ещё не разобраны — приз не должен их дублировать.
        const prize = bestCandidate(s.filtered, s.targets, new Set([...s.excluded, ...r.wins.map((w) => w.candidate.id)]))
        if (prize) {
          set({ bonus: g, bonusPrize: null, message: say(MSG.bonusPrize, prize.candidate.name, prize.matched.length, s.targets.length) })
          const rarity = rarityInPool(prize.matched.length, s.poolMax) ?? 'common'
          // Приз миниигры — первым, за ним кандидаты по линиям этого спина.
          const wins: SpinResult['wins'] = [{ candidate: prize.candidate, matched: prize.matched, lineIds: [], cells: r.scatters, rarity, fromBonus: true }, ...r.wins]
          const cellKeys = new Set<string>()
          const winCells = [...r.scatters, ...r.winCells].filter((c) => !cellKeys.has(`${c.reel}:${c.row}`) && !!cellKeys.add(`${c.reel}:${c.row}`))
          const bonusResult: SpinResult = {
            ...r,
            wins,
            winCells,
            winLines: r.winLines,
            winner: prize.candidate,
            matched: [...new Set([SCATTER, ...r.matched])],
            rarity: wins.reduce<Rarity>((best, w) => (RARITY_RANK[w.rarity] > RARITY_RANK[best] ? w.rarity : best), 'common'),
            nearMiss: null,
            fromBonus: !r.wins.length,
          }
          clearTimeout(finishTimer)
          finishTimer = setTimeout(() => {
            if (get().phase === 'bonus' && get().bonus === g) get().finishBonus()
          }, 2200)
          set({ bonusPrize: bonusResult })
          return
        }
        // Пул исчерпан — вместо кандидата утешительный приз.
      }
      // Проигрыш — без утешительных кредитов (чтобы звон монет не путал). Утешение остаётся
      // только когда бонус выигран, но выдать некого: пул исчерпан.
      const gain = g.status === 'won' ? s.bonusConsolation : 0
      set({
        bonus: g.status === 'won' ? { ...g, status: 'lost' } : g,
        credits: s.credits + gain,
        message: g.status === 'won' ? MSG.consolationEmpty(gain) : say(MSG.consolationMiss),
      })
      persist()
      clearTimeout(finishTimer)
      const cur = get().bonus
      finishTimer = setTimeout(() => {
        if (get().phase === 'bonus' && get().bonus === cur) get().finishBonus()
      }, 2400)
    },

    finishBonus: () => {
      const s = get()
      if (s.phase !== 'bonus' || !s.bonus || s.bonus.status === 'play') return
      clearTimeout(finishTimer)
      const result = s.bonusPrize
      if (s.bonus.status === 'won' && result) {
        const w = result.wins[0]
        const more = result.wins.length - 1
        set({
          result,
          phase: 'win',
          winIndex: 0,
          winAt: performance.now(),
          winOpen: true,
          bonus: null,
          bonusPrize: null,
          upgradeApplied: {},
          stats: { ...s.stats, wins: s.stats.wins + 1 },
          message: more
            ? MSG.goldenMore(w.candidate.name, w.matched.length, more, result.wins.reduce((a, ww) => a + payoutFor(ww.matched.length, s.winScale), 0))
            : MSG.goldenOne(w.candidate.name, w.matched.length, payoutFor(w.matched.length, s.winScale)),
        })
      } else if (s.result?.wins.length) {
        // Бонус проигран, но по линиям выпали люди — теперь их можно смотреть.
        set({ phase: 'win', winIndex: 0, winAt: performance.now(), winOpen: false, bonus: null, bonusPrize: null, upgradeApplied: {}, message: MSG.bonusOverWith(winsText(s.result, s.winScale)) })
      } else set({ phase: 'idle', bonus: null, bonusPrize: null, message: say(MSG.bonusOver) })
      persist()
    },

    startUpgrade: () => {
      const s = get()
      if (s.phase !== 'win') return
      const w = currentWin()
      if (!w) return
      // Апгрейдится КАРТОЧКА, а не сам кандидат: при победе текущий кандидат целиком заменяется
      // на другого, честно подобранного заранее из пула со следующим уровнем матча.
      if (s.upgradeApplied[s.winIndex]) return
      // Грейд и навыки исходной карточки — те, что сложились на линиях (как звёзды в карточке),
      // а не все навыки кандидата из набора.
      const own = [...new Set(w.matched)]
      const nx = pickUpgradeTarget(w.candidate, own.length, [])
      if (!nx) return
      const g = newUpgrade(w.candidate, own.length, nx.candidate, nx.grade, Math.random, { holder: own, next: nx.skills })
      clearTimeout(upgradeTimer)
      set({
        phase: 'upgrade',
        auto: false,
        winOpen: false,
        upgrade: g,
        upgradeAt: performance.now(),
        message: say(MSG.wheelStart, { from: g.grade, to: nx.grade, odds: wheelOdds(g) }),
      })
    },

    spinWheel: () => {
      const s = get()
      if (s.phase !== 'upgrade' || !s.upgrade) return
      const g = spinUpgradeWheel(s.upgrade)
      if (g === s.upgrade) return
      set({ upgrade: g, message: say(MSG.negotiating, { from: g.grade, to: g.nextGrade, odds: wheelOdds(g) }) })
      clearTimeout(upgradeTimer)
      upgradeTimer = setTimeout(settleWheel, WHEEL_SPIN_MS)
    },

    takeUpgrade: () => {
      const s = get()
      const g = s.upgrade
      if (s.phase !== 'upgrade' || !g || (g.status !== 'ready' && g.status !== 'max')) return
      clearTimeout(upgradeTimer)
      const w = s.result?.wins[s.winIndex]
      if (!g.step || !s.result || !w) {
        // Ни одной ступени не пройдено — просто отказ от торга, карточка остаётся как была.
        set({ phase: 'win', winOpen: true, upgrade: null, message: w ? say(MSG.stays, w.candidate.name, w.matched.length) : '' })
        return
      }
      // Исходный кандидат и промежуточные ступени больше не выпадут; держатель показывается в карточке.
      const holder = g.holder
      const matched = g.skills
      const rarity = rarityInPool(matched.length, s.poolMax) ?? w.rarity
      const wins = s.result.wins.map((ww, i) => (i === s.winIndex ? { ...w, candidate: holder, matched, rarity } : ww))
      const used = [g.originId, ...g.passed.slice(0, -1).map((c) => c.id)]
      set({
        result: { ...s.result, wins },
        excluded: [...s.excluded, ...used],
        upgradeApplied: { ...s.upgradeApplied, [s.winIndex]: true },
        phase: 'win',
        winOpen: true,
        upgrade: null,
        message: say(MSG.deal, g.step > 1 ? MSG.dealSteps(g.step) : '', holder.name, matched.length),
      })
      refreshPool()
      persist()
    },

    finishUpgrade: () => {
      const s = get()
      const g = s.upgrade
      if (s.phase !== 'upgrade' || !g || g.status !== 'lost') return
      clearTimeout(upgradeTimer)
      const w = s.result?.wins[s.winIndex]
      // Проигрыш сжигает всю цепочку: исходный кандидат и все выигранные по пути уходят.
      set({
        upgrade: null,
        upgradeApplied: { ...s.upgradeApplied, [s.winIndex]: true },
        excluded: [...s.excluded, g.originId, ...g.passed.map((c) => c.id)],
      })
      refreshPool()
      if (w) {
        // Возвращаемся в фазу 'win' — advance() ожидает её (как после exchange/keep) и либо
        // покажет следующего кандидата этого спина, либо (через afterWins) уйдёт в 'idle'/бонус.
        set({ phase: 'win', winOpen: true })
        advance(say(MSG.walkedAway, g.step ? MSG.walkedChain(`${g.step} ${plural(g.step, 'step', 'steps', 'steps')}`) : ''))
      } else set({ phase: 'idle', winOpen: false })
      persist()
    },

    resetProgress: () => {
      if (get().phase === 'spinning') return
      set({ credits: START_CREDITS, excluded: [], stats: { spins: 0, wins: 0, exchanged: 0 }, phase: 'idle', winOpen: false, message: say(MSG.reset) })
      refreshPool()
      persist()
    },
  }
})

// Для отладки и headless-проверок в dev-режиме.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __game: typeof useGame }).__game = useGame
