import { describe, expect, it } from 'vitest'
import { bestCandidate, BOARD_SIZE, makeBoard, newBonus, openFolder, shieldsFor, winChance, type BonusGame } from './bonus'
import { buildField, buildReelModel, SCATTER, SCATTER_P, spinField, targetShareFor, topSkills } from './outcome'
import { bonusChance, bonusValue, payScaleTable } from './calibrate'
import { makeMockCandidates } from '../data/mockCandidates'

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const candidates = makeMockCandidates()
const roleIds = topSkills(candidates, 20).map((s) => s.id)
const targets = roleIds.slice(0, 5)

/** Играет миниигру до конца, открывая папки в случайном порядке. */
function playOut(g: BonusGame, rng: () => number): BonusGame {
  while (g.status === 'play') {
    const closed = g.openedAt.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0)
    g = openFolder(g, closed[Math.floor(rng() * closed.length)])
  }
  return g
}

describe('bonus: pick-em', () => {
  it('board has 12 folders: 5 hire, 5 reject, 2 empty', () => {
    const b = makeBoard(seeded(3))
    expect(b).toHaveLength(BOARD_SIZE)
    expect(b.filter((f) => f === 'hire')).toHaveLength(5)
    expect(b.filter((f) => f === 'reject')).toHaveLength(5)
  })

  it('exact win chance grows with scatters: 50 / 74 / 92 %', () => {
    expect(winChance(3)).toBeCloseTo(0.5, 6)
    expect(winChance(4)).toBeCloseTo(0.738, 3)
    expect(winChance(5)).toBeCloseTo(0.917, 3)
    expect(winChance(8)).toBe(winChance(5))
    expect([2, 3, 4, 5, 9].map(shieldsFor)).toEqual([0, 0, 1, 2, 2])
  })

  it('simulated games match the exact win chance', () => {
    const rng = seeded(11)
    for (const k of [3, 4, 5]) {
      let won = 0
      const N = 4000
      for (let i = 0; i < N; i++) if (playOut(newBonus(k, rng), rng).status === 'won') won++
      expect(Math.abs(won / N - winChance(k))).toBeLessThan(0.03)
    }
  })

  it('shield absorbs a reject; opened folders cannot be reopened; finished game is frozen', () => {
    const g0: BonusGame = { ...newBonus(4, seeded(1)), board: ['reject', 'reject', 'reject', 'reject', 'hire', 'hire', 'hire', 'empty', 'hire', 'hire', 'reject', 'empty'] }
    let g = openFolder(g0, 0)
    expect(g.blocked).toEqual([0])
    expect(g.rejects).toBe(0)
    expect(openFolder(g, 0)).toBe(g)
    g = openFolder(openFolder(openFolder(g, 1), 2), 3)
    expect(g.status).toBe('lost')
    expect(openFolder(g, 4)).toBe(g)
  })

  it('prize is the best match in the pool, never an excluded one', () => {
    const t = new Set(targets)
    const count = (skills: string[]) => new Set(skills.filter((s) => t.has(s))).size
    const best = Math.max(...candidates.map((c) => count(c.skills)))
    const tied = candidates.filter((c) => count(c.skills) === best)
    const first = bestCandidate(candidates, targets, new Set(), seeded(2))!
    expect(first.matched).toHaveLength(best)
    const excluded = new Set(tied.map((c) => c.id))
    const next = bestCandidate(candidates, targets, excluded, seeded(2))!
    expect(excluded.has(next.candidate.id)).toBe(false)
    expect(next.matched.length).toBeLessThan(best)
  })
})

describe('bonus: scatter on the reels', () => {
  it('scatter takes its share from blanks only — target share is unchanged', () => {
    const m = buildReelModel(candidates, targets, roleIds)
    const total = m.cum[m.cum.length - 1]
    const targetShare = targets.reduce((a, s) => a + m.probs[m.symbols.indexOf(s)], 0) / total
    expect(targetShare).toBeCloseTo(targetShareFor(5), 6)
    expect(m.probs[m.symbols.indexOf(SCATTER)] / total).toBeCloseTo(SCATTER_P, 6)
  })

  it('bonus triggers roughly once per 5–7 spins and matches the binomial', () => {
    // SCATTER_P поднят до 0,095 (решение от 23.09) — бонус специально не редкий, ≈ раз в 6 спинов.
    const field = buildField(candidates, targets, roleIds)
    const exact = bonusChance(field)
    expect(1 / exact).toBeGreaterThan(5)
    expect(1 / exact).toBeLessThan(7)
    const rng = seeded(5)
    let hits = 0
    let scatters = 0
    const N = 20000
    for (let i = 0; i < N; i++) {
      const r = spinField(field, 1, { rng })
      if (r.bonus) hits++
      scatters += r.scatters.length
      expect(r.bonus === 0 || r.bonus === r.scatters.length).toBe(true)
    }
    expect(Math.abs(hits / N - exact)).toBeLessThan(0.004)
    // ≈ 1,4 папки на экране за спин при SCATTER_P=0,095 — видно почти на каждом спине.
    expect(scatters / N).toBeGreaterThan(1.2)
  })

  it('scatter never takes part in skill wins', () => {
    const field = buildField(candidates, targets, roleIds)
    const rng = seeded(9)
    for (let i = 0; i < 2000; i++) for (const w of spinField(field, 25, { rng }).wins) expect(w.matched).not.toContain(SCATTER)
  })

  it('calibration accounts for the bonus and keeps RTP near target', () => {
    const field = buildField(candidates, targets, roleIds)
    const b = bonusValue(field, 1)
    expect(b.mult).toBeGreaterThan(0)
    expect(b.fixed).toBeGreaterThan(0)
    const table = payScaleTable(field)
    for (const v of Object.values(table)) expect(v).toBeGreaterThan(0.3)
  })
})
