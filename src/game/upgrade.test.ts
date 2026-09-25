import { describe, expect, it } from 'vitest'
import { buildWheel, chancesFor, MIN_SECTOR, PUSH_SECTORS, SECTORS, newUpgrade, PUSH_SHARE, sectorAt, settleSpin, spinOutcome, spinWheel, WIN_CHANCE, winChance, type UpgradeGame } from './upgrade'
import type { Candidate } from './types'

const cand = (id: string): Candidate => ({ id, name: `Cand ${id}`, skills: ['react'], source: 'mock', url: '' })

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const grades = Object.keys(WIN_CHANCE).map(Number)
/** Бесконечная лесенка целей: следующий грейд = текущий + 1. */
const ladder = (h: Candidate, grade: number) => ({ candidate: cand(`${h.id}+`), grade: grade + 1 })

describe('upgrade: negotiation wheel', () => {
  it('wheel covers the whole circle with the exact areas', () => {
    for (const g of grades) {
      const s = buildWheel(g, seeded(g))
      const total = s.reduce((a, x) => a + x.size, 0)
      expect(total).toBeCloseTo(1, 9)
      const area = (k: string) => s.filter((x) => x.kind === k).reduce((a, x) => a + x.size, 0)
      const w = winChance(g)
      expect(area('push')).toBeCloseTo(PUSH_SHARE, 9)
      expect(area('win')).toBeCloseTo(w * (1 - PUSH_SHARE), 9)
      expect(area('lose')).toBeCloseTo((1 - w) * (1 - PUSH_SHARE), 9)
      // Сектора идут подряд без дыр.
      for (let i = 1; i < s.length; i++) expect(s[i].start).toBeCloseTo(s[i - 1].start + s[i - 1].size, 9)
    }
  })

  it('fewer, wider sectors: none narrower than MIN_SECTOR unless the chance itself is smaller', () => {
    for (const g of grades) {
      for (let seed = 1; seed < 20; seed++) {
        const s = buildWheel(g, seeded(seed * 31 + g))
        expect(s.length).toBeLessThan(SECTORS + 1)
        expect(s.filter((x) => x.kind === 'push').length).toBe(PUSH_SECTORS)
        const wins = s.filter((x) => x.kind === 'win')
        const loses = s.filter((x) => x.kind === 'lose')
        expect(wins.length).toBeGreaterThan(0)
        expect(loses.length).toBeGreaterThan(0)
        for (const x of loses) expect(x.size).toBeGreaterThan(MIN_SECTOR - 1e-9)
        if (wins.length > 1) for (const x of wins) expect(x.size).toBeGreaterThan(MIN_SECTOR - 1e-9)
      }
    }
  })

  it('green sectors are scattered, not one arc', () => {
    const s = buildWheel(7, seeded(1))
    const runs = s.filter((x, i) => x.kind === 'win' && s[(i + s.length - 1) % s.length].kind !== 'win').length
    expect(runs).toBeGreaterThan(1)
  })

  it('final step chance with free respins equals WIN_CHANCE', () => {
    for (const g of grades) {
      expect(chancesFor(g).win).toBeCloseTo(WIN_CHANCE[g], 9)
      const sp = chancesFor(g).spin
      expect(sp.win + sp.push + sp.lose).toBeCloseTo(100, 9)
      expect(sp.win / (sp.win + sp.lose)).toBeCloseTo(WIN_CHANCE[g] / 100, 9)
    }
  })

  it('empirical step chance matches the table (respins included)', () => {
    const rng = seeded(42)
    for (const g of [3, 5, 7, 10]) {
      let won = 0
      const N = 40_000
      for (let k = 0; k < N; k++) {
        let game: UpgradeGame = newUpgrade(cand('a'), g, cand('b'), g + 1, rng)
        for (let guard = 0; guard < 100; guard++) {
          game = settleSpin(spinWheel(game, rng), ladder, rng)
          if (game.last !== 'push') break
        }
        if (game.last === 'win') won++
      }
      expect(Math.abs(won / N - WIN_CHANCE[g] / 100)).toBeLessThan(0.012)
    }
  })

  it('spin outcome is the sector under the pointer', () => {
    const g = newUpgrade(cand('a'), 7, cand('b'), 8, seeded(3))
    for (const u of [0, 0.13, 0.5, 0.77, 0.999]) {
      const s = spinWheel(g, () => u)
      expect(spinOutcome(s)).toBe(sectorAt(g.sectors, u).kind)
    }
  })

  it('win climbs the chain and swaps the holder', () => {
    const g = newUpgrade(cand('a'), 5, cand('b'), 6, seeded(5))
    const winAt = g.sectors.find((s) => s.kind === 'win')!
    const s1 = settleSpin(spinWheel(g, () => winAt.start + winAt.size / 2), ladder, seeded(6))
    expect(s1.status).toBe('ready')
    expect(s1.last).toBe('win')
    expect(s1.holder.id).toBe('b')
    expect(s1.prev?.id).toBe('a')
    expect(s1.grade).toBe(6)
    expect(s1.step).toBe(1)
    expect(s1.path).toEqual([5, 6])
    expect(s1.passed.map((c) => c.id)).toEqual(['b'])
    expect(s1.next?.id).toBe('b+')
    expect(s1.nextGrade).toBe(7)
  })

  it('reaching the pool ceiling ends in max', () => {
    const g = newUpgrade(cand('a'), 8, cand('b'), 9, seeded(7))
    const winAt = g.sectors.find((s) => s.kind === 'win')!
    const s1 = settleSpin(spinWheel(g, () => winAt.start + winAt.size / 2), () => null)
    expect(s1.status).toBe('max')
    expect(s1.next).toBeNull()
    expect(spinWheel(s1)).toBe(s1)
  })

  it('push keeps the step, lose ends the chain', () => {
    const g = newUpgrade(cand('a'), 5, cand('b'), 6, seeded(8))
    const push = g.sectors.find((s) => s.kind === 'push')!
    const lose = g.sectors.find((s) => s.kind === 'lose')!
    const p = settleSpin(spinWheel(g, () => push.start + push.size / 2), ladder)
    expect(p.status).toBe('ready')
    expect(p.last).toBe('push')
    expect(p.holder.id).toBe('a')
    expect(p.step).toBe(0)
    const l = settleSpin(spinWheel(g, () => lose.start + lose.size / 2), ladder)
    expect(l.status).toBe('lost')
    expect(spinWheel(l)).toBe(l)
    expect(settleSpin(l, ladder)).toBe(l)
  })

  it('board skills: origin keeps its line matches, a win swaps in the target skills', () => {
    const ladderSkills = (h: Candidate, grade: number) => ({ candidate: cand(`${h.id}+`), grade: grade + 1, skills: Array.from({ length: grade + 1 }, (_, i) => `s${i}`) })
    const g = newUpgrade(cand('a'), 3, cand('b'), 4, seeded(9), { holder: ['s0', 's1', 's2'], next: ['s0', 's1', 's2', 's3'] })
    expect(g.skills).toEqual(['s0', 's1', 's2'])
    expect(g.skills.length).toBe(g.grade)
    expect(g.prevSkills).toBeNull()
    const winAt = g.sectors.find((s) => s.kind === 'win')!
    const s1 = settleSpin(spinWheel(g, () => winAt.start + winAt.size / 2), ladderSkills, seeded(10))
    expect(s1.skills).toEqual(['s0', 's1', 's2', 's3'])
    expect(s1.prevSkills).toEqual(['s0', 's1', 's2'])
    expect(s1.nextSkills.length).toBe(5)
  })

  it('every game gets its own id (UI tells games apart by it)', () => {
    const a = newUpgrade(cand('a'), 5, cand('b'), 6)
    const b = newUpgrade(cand('a'), 5, cand('b'), 6)
    expect(a.id).not.toBe(b.id)
    expect(spinWheel(a).id).toBe(a.id)
  })

  it('0% and 100% wheels have no push sectors', () => {
    const saved = { ...WIN_CHANCE }
    WIN_CHANCE[3] = 100
    WIN_CHANCE[10] = 0
    try {
      expect(buildWheel(3).every((s) => s.kind === 'win')).toBe(true)
      expect(buildWheel(10).every((s) => s.kind === 'lose')).toBe(true)
    } finally {
      Object.assign(WIN_CHANCE, saved)
    }
  })
})
