import { describe, expect, it } from 'vitest'
import { chancesFor, CLOSED_COUNT, newUpgrade, OFFERS, openDistribution, pickOffer, PUSH_CHANCE, WIN_CHANCE, type UpgradeGame } from './upgrade'
import type { Candidate } from './types'

const fakeCandidate = (id = 'next'): Candidate => ({ id, name: 'Next Candidate', skills: ['react'], source: 'mock', url: '' })

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const grades = Object.keys(WIN_CHANCE).map(Number)

describe('upgrade: salary offer negotiation', () => {
  it('offers are strictly increasing', () => {
    for (let i = 1; i < OFFERS.length; i++) expect(OFFERS[i]).toBeGreaterThan(OFFERS[i - 1])
  })

  it('open-offer distribution sums to 1 for every grade', () => {
    for (const g of grades) {
      const p = openDistribution(g)
      expect(p).toHaveLength(OFFERS.length)
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
      for (const x of p) expect(x).toBeGreaterThanOrEqual(0)
    }
  })

  it('chances always sum to 100%, push is fixed', () => {
    for (const g of grades) {
      const c = chancesFor(g)
      expect(c.win + c.push + c.lose).toBeCloseTo(100, 9)
      expect(c.push).toBeCloseTo(PUSH_CHANCE, 9)
      expect(c.win).toBeCloseTo(WIN_CHANCE[g], 6)
    }
  })

  it('exact win chance from the distribution matches WIN_CHANCE', () => {
    const n = OFFERS.length
    for (const g of grades) {
      const p = openDistribution(g)
      const win = p.reduce((a, x, i) => a + x * ((n - 1 - i) / n), 0)
      expect(win * 100).toBeCloseTo(WIN_CHANCE[g], 4)
    }
  })

  it('empirical win/push/loss frequencies match the table', () => {
    const rng = seeded(5)
    const N = 20000
    for (const g of [3, 5, 7]) {
      let won = 0
      let pushed = 0
      for (let i = 0; i < N; i++) {
        const r = pickOffer(newUpgrade('c1', fakeCandidate(), g, rng), Math.floor(rng() * CLOSED_COUNT))
        if (r.status === 'won') won++
        else if (r.status === 'pushed') pushed++
      }
      expect(Math.abs((won / N) * 100 - WIN_CHANCE[g])).toBeLessThan(1.5)
      expect(Math.abs((pushed / N) * 100 - PUSH_CHANCE)).toBeLessThan(1.5)
    }
  })

  it('closed offers are independent of grade (uniform)', () => {
    const rng = seeded(9)
    const counts = new Array(OFFERS.length).fill(0)
    const N = 20000
    for (let i = 0; i < N; i++) for (const v of newUpgrade('c1', fakeCandidate(), 9, rng).closed) counts[v]++
    for (const c of counts) expect(Math.abs(c / (N * CLOSED_COUNT) - 1 / OFFERS.length)).toBeLessThan(0.01)
  })

  it('classifies higher/equal/lower correctly and is one-shot', () => {
    const base = newUpgrade('c1', fakeCandidate(), 5, seeded(2))
    const g: UpgradeGame = { ...base, open: 4, closed: [6, 4, 1, 3, 2] }
    expect(pickOffer(g, 0).status).toBe('won')
    expect(pickOffer(g, 1).status).toBe('pushed')
    expect(pickOffer(g, 2).status).toBe('lost')
    const done = pickOffer(g, 0)
    expect(pickOffer(done, 1)).toBe(done)
    expect(pickOffer(g, -1)).toBe(g)
    expect(pickOffer(g, CLOSED_COUNT)).toBe(g)
  })
})
