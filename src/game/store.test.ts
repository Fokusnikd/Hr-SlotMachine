import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGame } from './store'
import { REELS } from './outcome'
import type { Candidate, SpinResult } from './types'

const cand = (id: string, skills: string[]): Candidate => ({ id, name: id, url: '', skills, source: 'mock' })
const TARGETS = ['react', 'typescript', 'node', 'docker', 'sql']
const people = [
  cand('line-a', ['react', 'typescript', 'node']),
  cand('best', ['react', 'typescript', 'node', 'docker', 'sql']),
  cand('mid', ['react', 'typescript', 'node', 'docker']),
]
const scatters = [
  { reel: 0, row: 0 },
  { reel: 2, row: 1 },
  { reel: 4, row: 2 },
]

function spinResult(withLineWin: boolean): SpinResult {
  const wins = withLineWin
    ? [{ candidate: people[0], matched: ['react', 'typescript', 'node'], lineIds: [1], cells: [0, 1, 2].map((reel) => ({ reel, row: 1 })), rarity: 'common' as const }]
    : []
  return {
    grid: [],
    line: [],
    cells: [],
    lines: [{ id: 1, color: '#fff', rows: [1, 1, 1, 1, 1] }],
    wins,
    winCells: wins.flatMap((w) => w.cells),
    winLines: withLineWin ? [1] : [],
    winner: wins[0]?.candidate ?? null,
    matched: wins[0]?.matched ?? [],
    rarity: wins[0]?.rarity ?? null,
    scatters,
    bonus: 3,
    nearMiss: null,
  }
}

/** Барабаны остановились с бонусом; доска миниигры подменяется на предсказуемую. */
function landBonus(withLineWin: boolean, outcome: 'won' | 'lost') {
  useGame.setState({
    all: people,
    filtered: people,
    targets: TARGETS,
    excluded: [],
    phase: 'spinning',
    stoppedReels: REELS - 1,
    result: spinResult(withLineWin),
    winScale: 4,
    auto: true,
  })
  useGame.getState().reelStopped(REELS - 1)
  const s = useGame.getState()
  // Бонус первым: кандидаты по линиям ещё не показаны.
  expect(s.phase).toBe('spinning')
  expect(s.pendingBonus).toBe(3)
  expect(s.auto).toBe(false)
  vi.advanceTimersByTime(2600)
  expect(useGame.getState().phase).toBe('bonus')
  const g = useGame.getState().bonus!
  const face = outcome === 'won' ? 'hire' : 'reject'
  useGame.setState({ bonus: { ...g, board: g.board.map((_, i) => (i < 3 ? face : 'empty')) } })
  for (const i of [0, 1, 2]) useGame.getState().openFolder(i)
  expect(useGame.getState().bonus!.status).toBe(outcome)
  vi.advanceTimersByTime(2500)
}

describe('бонус «Золотая папка» запускается раньше кандидатов по линиям', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('победа: сначала карточка приза, за ним кандидат по линиям', () => {
    landBonus(true, 'won')
    const s = useGame.getState()
    expect(s.phase).toBe('win')
    expect(s.winOpen).toBe(true)
    expect(s.result!.wins.map((w) => w.candidate.id)).toEqual(['best', 'line-a'])
    expect(s.result!.wins[0].fromBonus).toBe(true)
    expect(s.result!.wins[1].fromBonus).toBeFalsy()
    // Разобрали приз — дальше кандидат по линиям.
    s.keep()
    expect(useGame.getState().phase).toBe('win')
    expect(useGame.getState().result!.wins[useGame.getState().winIndex].candidate.id).toBe('line-a')
    useGame.getState().exchange()
    expect(useGame.getState().phase).toBe('idle')
  })

  it('приз не дублирует кандидата, выпавшего по линиям', () => {
    useGame.setState({ excluded: [] })
    const onlyLine = [people[0]]
    landBonusWithPool(onlyLine)
    const s = useGame.getState()
    // Кроме кандидата по линиям никого нет — утешительный приз, затем кандидат по линиям.
    expect(s.phase).toBe('win')
    expect(s.result!.wins.map((w) => w.candidate.id)).toEqual(['line-a'])
  })

  it('проигрыш: после бонуса можно открыть кандидата по линиям', () => {
    landBonus(true, 'lost')
    const s = useGame.getState()
    expect(s.phase).toBe('win')
    expect(s.winOpen).toBe(false)
    expect(s.winIndex).toBe(0)
    expect(s.result!.wins.map((w) => w.candidate.id)).toEqual(['line-a'])
    s.openWin()
    expect(useGame.getState().winOpen).toBe(true)
  })

  it('бонус без кандидатов по линиям: проигрыш — обратно к спинам', () => {
    landBonus(false, 'lost')
    expect(useGame.getState().phase).toBe('idle')
  })
})

function landBonusWithPool(pool: Candidate[]) {
  useGame.setState({ all: pool, filtered: pool, targets: TARGETS, excluded: [], phase: 'spinning', stoppedReels: REELS - 1, result: spinResult(true), winScale: 4 })
  useGame.getState().reelStopped(REELS - 1)
  vi.advanceTimersByTime(2600)
  const g = useGame.getState().bonus!
  useGame.setState({ bonus: { ...g, board: g.board.map((_, i) => (i < 3 ? 'hire' : 'empty')) } })
  for (const i of [0, 1, 2]) useGame.getState().openFolder(i)
  vi.advanceTimersByTime(2500)
}
