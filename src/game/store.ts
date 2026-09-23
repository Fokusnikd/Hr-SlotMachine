import { create } from 'zustand'
import type { Candidate, CandidateSource, SkillId, SpinResult } from './types'
import { BASE_SKILLS, buildField, describeLines, linesFor, MAX_LINES, MAX_SKILLS, MIN_MATCH, MIN_SKILLS, minLinesFor, REELS, spinField, topSkills, type Field, type Payline } from './outcome'
import { payoutFor, plural, REFILL_AMOUNT, scaleForLines, spinCost, START_CREDITS } from './economy'
import { calibratePayScale } from './calibrate'
import { load, save } from './persist'
import { assignFx, type FxId } from './fx'
import { getSkill, normalizeSkill } from './skills'
import { makeMockCandidates } from '../data/mockCandidates'
import { loadDatabase } from '../data/db'
import { bestCandidate, CONSOLATION_SPINS, HIRES_TO_WIN, newBonus, openFolder as openBonusFolder, REJECTS_TO_LOSE, type BonusGame } from './bonus'
import { rarityFor, SCATTER } from './outcome'

export type Phase = 'idle' | 'spinning' | 'win' | 'bonus'
export type SourceFilter = 'all' | Exclude<CandidateSource, 'mock'>

export interface Settings {
  source: SourceFilter
  /** Фильтр через запятую: навыки («react, docker»), город, слова из должности. Условия объединяются через И. */
  filter: string
  /** Выбранные навыки позиции (3–10). Пусто — берём топ-5 позиции. */
  skills: SkillId[]
  /** Сколько линий выплат играет (линии 1…N по порядку). Не меньше минимума для числа навыков. */
  lines: number
  sound: boolean
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
  /** Бонус выпал вместе с кандидатами по линиям — запустится после их разбора (число папок). */
  pendingBonus: number
  /** Утешительный приз текущего бонуса, кредиты. */
  bonusConsolation: number
  /** Приз выигранной миниигры — покажется как обычный выигрыш после анимации. */
  bonusPrize: SpinResult | null

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
  refill: () => void
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
}

const initialSettings: Settings = {
  source: 'all',
  filter: '',
  skills: [],
  lines: 1,
  sound: true,
  fx: typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  ...load<Partial<Settings>>('settings.v2', {}),
  ...load<Partial<Settings>>('settings.v3', {}),
}

export const ROLE_SKILLS = 20

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
      set({ winIndex: next, message: `${note} ${left} more: ${w.candidate.name} ×${w.matched.length}` })
    } else {
      set({ winIndex: next })
      afterWins(note)
    }
  }

  const bonusStatus = (g: BonusGame) => {
    const shields = g.shields - g.blocked.length
    return `Match ${g.hires}/${HIRES_TO_WIN} · Miss ${g.rejects}/${REJECTS_TO_LOSE}${g.shields ? ` · Shields ${shields}/${g.shields}` : ''}`
  }

  let finishTimer: ReturnType<typeof setTimeout> | undefined

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
      message: `GOLDEN FOLDER ×${scatters}! Open the folders: 3 "Match" — a candidate, 3 "Miss" — a consolation prize.${bonus.shields ? ` Shields against "Miss": ${bonus.shields}` : ''}`,
    })
  }

  /** После разбора кандидатов: если бонус ждёт — запускаем, иначе обратно к спинам. */
  const afterWins = (note: string) => {
    const pending = get().pendingBonus
    if (pending) {
      set({ winIndex: get().result?.wins.length ?? 0, winOpen: false, message: note })
      startBonus(pending)
    } else set({ phase: 'idle', winOpen: false, message: note })
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
    message: 'Loading candidate database…',

    all: [],
    filtered: [],
    poolInfo: { total: 0, eligible: 0, seen: 0 },
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
    winOpen: false,
    skillFx: {},
    winAt: 0,
    db: { status: 'loading', counts: { all: 0, jsonresume: 0, github: 0 } },
    bonus: null,
    bonusAt: 0,
    pendingBonus: 0,
    bonusConsolation: 0,
    bonusPrize: null,

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
          message: 'Press SPIN or Space — time to find talent!',
        })
      } else {
        set({
          all: demo,
          settings: { ...get().settings, source: 'all' },
          db: { status: 'demo', counts: { all: demo.length, jsonresume: 0, github: 0 } },
          message: 'Database not built — playing on demo candidates',
        })
      }
      rebuild()
      if (!get().poolInfo.eligible) set({ message: 'No one matches this filter — change it in settings ⚙' })
    },

    spin: () => {
      let s = get()
      if (s.phase === 'spinning' || s.db.status === 'loading' || !s.field) return false
      // Во время миниигры ЗАПУСК/пробел только закрывают показанный результат.
      if (s.phase === 'bonus') {
        if (s.bonus && s.bonus.status !== 'play') get().finishBonus()
        return false
      }
      // Неразобранные кандидаты при новом спине автоматически обмениваются на кредиты.
      let exchangedNote = ''
      if (s.phase === 'win' && s.result) {
        const left = s.result.wins.slice(s.winIndex)
        const gain = left.reduce((a, w) => a + payoutFor(w.matched.length, s.winScale), 0)
        exchangedNote = `${left.length > 1 ? `${left.length} ${plural(left.length, 'person', 'people', 'people')}` : left[0].candidate.name} → +${gain} ◎. `
        set({
          credits: s.credits + gain,
          excluded: [...s.excluded, ...left.map((w) => w.candidate.id)],
          phase: 'idle',
          winOpen: false,
          winIndex: s.result.wins.length,
          stats: { ...s.stats, exchanged: s.stats.exchanged + left.length },
        })
        refreshPool()
        // Бонус этого спина ещё не сыгран — сначала миниигра.
        if (get().pendingBonus) {
          startBonus(get().pendingBonus)
          set({ message: `${exchangedNote}${get().message}` })
          persist()
          return false
        }
        s = get()
      }
      if (s.phase !== 'idle') return false
      if (s.credits < s.cost) {
        set({ auto: false, message: 'Out of credits — ask HRD for budget (button up top)' })
        return false
      }
      if (!s.poolInfo.eligible) {
        set({ auto: false, message: 'No more candidates for this filter — change the filter or reset progress ⚙' })
        return false
      }
      const result = spinField(s.field!, s.lines.length, { exclude: new Set(s.excluded) })
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
        message: exchangedNote + (s.auto ? 'Auto-spin: spinning…' : 'Spinning…'),
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
        // Автозапуск останавливается: миниигра требует кликов игрока.
        set({ auto: false, pendingBonus: r.bonus })
      }
      if (n) {
        const total = r.wins.reduce((a, w) => a + payoutFor(w.matched.length, s.winScale), 0)
        const w = r.wins[0]
        const text =
          n === 1
            ? `${w.matched.length} ${plural(w.matched.length, 'skill', 'skills', 'skills')} matched on ${w.lineIds.length > 1 ? 'lines' : 'line'} ${describeLines(w.lineIds)} — ${w.candidate.name}! OPEN — card, SPIN — exchange for +${total} ◎`
            : `${n} ${plural(n, 'person', 'people', 'people')} appeared, best ×${w.matched.length} — ${w.candidate.name}! OPEN — cards, SPIN — exchange all for +${total} ◎`
        const withBonus = r.bonus ? `${text} · Then — GOLDEN FOLDER ×${r.bonus}!` : text
        // Автозапуск останавливается на кандидате.
        set({ auto: false, winAt: performance.now(), stoppedReels: stopped, phase: 'win', winIndex: 0, message: withBonus, stats: { ...s.stats, wins: s.stats.wins + n } })
      } else if (r.bonus) {
        set({ stoppedReels: stopped })
        // Пауза: папки на барабанах успевают перевернуться на «ПРИНЯТ».
        setTimeout(() => {
          const now = get()
          if (now.phase === 'spinning' && now.pendingBonus) startBonus(now.pendingBonus)
        }, 2600)
        set({ message: `GOLDEN FOLDER ×${r.bonus}!` })
      } else if (r.nearMiss) {
        set({ stoppedReels: stopped, phase: 'idle', message: `Almost! 2 skills for ${r.nearMiss.candidate.name}. One more spin?` })
      } else {
        set({ stoppedReels: stopped, phase: 'idle', message: 'Miss. Talent is out there somewhere…' })
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
      advance(`+${gain} credits for ${w.candidate.name}.`)
      persist()
    },

    keep: () => {
      const s = get()
      const w = currentWin()
      if (!w) return
      const already = s.shortlist.some((c) => c.id === w.candidate.id)
      set({ shortlist: already ? s.shortlist : [w.candidate, ...s.shortlist] })
      markUsed(w.candidate)
      advance(`${w.candidate.name} added to shortlist ⭐`)
      persist()
    },
    refill: () => {
      set((s) => ({ credits: s.credits + REFILL_AMOUNT, message: `HRD granted +${REFILL_AMOUNT} credits` }))
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
            ? `Pool: ${poolInfo.total} · eligible ${poolInfo.eligible} · ${targets.length} ${plural(targets.length, 'skill', 'skills', 'skills')}, ${lines.length} ${plural(lines.length, 'line', 'lines', 'lines')}, spin ${cost} ◎`
            : 'No one matches this filter — loosen the conditions ⚙',
        })
      }
    },

    setLines: (count) => {
      const s = get()
      if (s.phase === 'spinning' || s.phase === 'bonus') return
      const min = minLinesFor(s.targets.length)
      if (count < min) {
        set({ message: `${s.targets.length} ${plural(s.targets.length, 'skill', 'skills', 'skills')} need at least ${min} ${plural(min, 'line', 'lines', 'lines')}` })
        return
      }
      const next = Math.min(MAX_LINES, count)
      if (next !== s.lines.length) get().updateSettings({ lines: next })
      else set({ linesChangedAt: performance.now() })
      set({ message: `${next} ${plural(next, 'line', 'lines', 'lines')} · spin ${get().cost} ◎` })
    },

    toggleAuto: () => {
      const s = get()
      if (s.auto) {
        set({ auto: false, message: 'Auto-spin stopped' })
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
      if (s.phase === 'spinning' || s.phase === 'bonus') return
      const min = minLinesFor(s.targets.length)
      const next = Math.min(MAX_LINES, Math.max(min, s.lines.length + delta))
      if (next === s.lines.length) {
        set({ linesChangedAt: performance.now() })
        if (delta < 0) set({ message: `${s.targets.length} ${plural(s.targets.length, 'skill', 'skills', 'skills')} need at least ${min} ${plural(min, 'line', 'lines', 'lines')}` })
        return
      }
      get().updateSettings({ lines: next })
      const { cost } = get()
      set({ message: `${next} ${plural(next, 'line', 'lines', 'lines')} · spin ${cost} ◎` })
    },

    openFolder: (index) => {
      const s = get()
      if (s.phase !== 'bonus' || !s.bonus) return
      if (s.bonus.status !== 'play') return get().finishBonus()
      const g = openBonusFolder(s.bonus, index)
      if (g === s.bonus) return
      const f = g.board[index]
      const note = f === 'hire' ? 'MATCH!' : f === 'empty' ? 'Empty.' : g.blocked.includes(index) ? 'Miss — but a shield saved it!' : 'MISS.'
      if (g.status === 'play') {
        set({ bonus: g, message: `${note} ${bonusStatus(g)}` })
        return
      }
      if (g.status === 'won') {
        const prize = bestCandidate(s.filtered, s.targets, new Set(s.excluded))
        if (prize) {
          set({ bonus: g, bonusPrize: null, message: `WIN! ${prize.candidate.name} — ${prize.matched.length} of ${s.targets.length} skills. Opening the card…` })
          const r = s.result!
          const rarity = rarityFor(prize.matched.length) ?? 'common'
          const bonusResult: SpinResult = {
            ...r,
            wins: [{ candidate: prize.candidate, matched: prize.matched, lineIds: [], cells: r.scatters, rarity }],
            winCells: r.scatters,
            winLines: [],
            winner: prize.candidate,
            matched: [SCATTER],
            rarity,
            nearMiss: null,
            fromBonus: true,
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
      const gain = s.bonusConsolation
      set({
        bonus: g.status === 'won' ? { ...g, status: 'lost' } : g,
        credits: s.credits + gain,
        message: g.status === 'won' ? `No matching candidates left — consolation prize +${gain} ◎` : `Three misses… Consolation prize +${gain} ◎`,
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
        set({
          result,
          phase: 'win',
          winIndex: 0,
          winAt: performance.now(),
          winOpen: true,
          bonus: null,
          bonusPrize: null,
          stats: { ...s.stats, wins: s.stats.wins + 1 },
          message: `Golden Folder: ${w.candidate.name} ×${w.matched.length}! SPIN — exchange for +${payoutFor(w.matched.length, s.winScale)} ◎`,
        })
      } else set({ phase: 'idle', bonus: null, bonusPrize: null, message: 'Bonus over. Keep spinning!' })
      persist()
    },

    resetProgress: () => {
      if (get().phase === 'spinning') return
      set({ credits: START_CREDITS, excluded: [], stats: { spins: 0, wins: 0, exchanged: 0 }, phase: 'idle', winOpen: false, message: 'Progress reset. Good luck!' })
      refreshPool()
      persist()
    },
  }
})

// Для отладки и headless-проверок в dev-режиме.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __game: typeof useGame }).__game = useGame
