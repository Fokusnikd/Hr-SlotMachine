import { describe, expect, it } from 'vitest'
import { activeCells, buildField, buildReelModel, spinField, buildSymbolPool, combosFor, evaluateGrid, evaluateLine, evaluateStructure, generateSpin, linesFor, MAX_LINES, minLinesFor, PAYLINES, REELS, ROWS, topSkills } from './outcome'
import { makeMockCandidates } from '../data/mockCandidates'
import { deriveSkills } from '../data/sources/github'
import { compactResume, jsonResumeToCandidate } from '../data/sources/jsonresume'
import { applyFilter, resolveSkills } from './store'
import { extractSkillsFromText, normalizeKeyword, normalizeSkill } from './skills'
import { payoutFor, payScaleFrom, spinCost } from './economy'

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const candidates = makeMockCandidates()
const pool = buildSymbolPool(candidates)
const role = topSkills(candidates, 20)
const roleIds = role.map((s) => s.id)

describe('paylines', () => {
  it('has 25 distinct lines, one cell per reel', () => {
    expect(PAYLINES).toHaveLength(25)
    expect(new Set(PAYLINES.map((l) => l.rows.join())).size).toBe(25)
    for (const l of PAYLINES) {
      expect(l.rows).toHaveLength(REELS)
      expect(l.rows.every((r) => r >= 0 && r < ROWS)).toBe(true)
    }
  })

  it('separate straight lines are separate combos, line 4 chains all rows', () => {
    expect(combosFor(linesFor(3)).map((c) => c.cells.length)).toEqual([5, 5, 5])
    const four = combosFor(linesFor(4))
    expect(four).toHaveLength(1)
    expect(four[0].cells).toHaveLength(15)
    expect(four[0].lineIds).toEqual([1, 2, 3, 4])
  })

  it('minimum lines: 1 up to 5 skills, 4 for 6–10', () => {
    for (let k = 3; k <= 5; k++) expect(minLinesFor(k)).toBe(1)
    for (let k = 6; k <= 10; k++) expect(minLinesFor(k)).toBe(4)
    expect(linesFor(99)).toHaveLength(MAX_LINES)
  })

  it('spin cost is per line, payout grows with matches and pay scale', () => {
    expect(spinCost(4)).toBe(4 * spinCost(1))
    expect(payoutFor(4, 1)).toBeGreaterThan(payoutFor(3, 1))
    expect(payoutFor(3, 3)).toBeGreaterThan(payoutFor(3, 1))
    expect(payoutFor(2, 5)).toBe(0)
    // Реже выигрыши — крупнее масштаб выплат.
    expect(payScaleFrom(0.5, 9)).toBeGreaterThan(payScaleFrom(2, 9))
  })

  it('duplicate skills across lines count once', () => {
    const c = { ...candidates[0], skills: ['react', 'typescript', 'css', 'node', 'docker', 'go'] }
    const same = ['react', 'typescript', 'css', 'node', 'docker']
    const grid = [same, same, same]
    const cells = activeCells(linesFor(25))
    const ev = evaluateGrid(grid, cells, new Set(c.skills), [c])
    expect(ev.winner?.id).toBe(c.id)
    expect(ev.matched).toHaveLength(5)
  })

  it('counts only selected skills', () => {
    const c = { ...candidates[0], skills: ['react', 'typescript', 'css', 'node', 'docker'] }
    const grid = [['go', 'go', 'go', 'go', 'go'], ['react', 'typescript', 'css', 'node', 'docker'], ['go', 'go', 'go', 'go', 'go']]
    const ev = evaluateGrid(grid, activeCells(linesFor(2).slice(1)), new Set(['react', 'typescript', 'go']), [c])
    expect(ev.winner).toBeNull()
    expect(ev.nearMiss?.matched).toHaveLength(2)
  })

  it('resolveSkills keeps valid picks and falls back to top-5', () => {
    expect(resolveSkills([roleIds[7], roleIds[8], roleIds[9], 'nope'], role)).toEqual([roleIds[7], roleIds[8], roleIds[9]])
    expect(resolveSkills(['nope'], role)).toEqual(roleIds.slice(0, 5))
    expect(resolveSkills(roleIds, role)).toHaveLength(10)
  })
})

describe('outcome', () => {
  it('pool has a reasonable alphabet', () => {
    expect(pool.length).toBeGreaterThanOrEqual(10)
    expect(pool.length).toBeLessThanOrEqual(14)
  })

  it('evaluateLine finds a candidate with 3 matching skills', () => {
    const c = candidates[0]
    const line = [c.skills[0], c.skills[1], c.skills[2], 'zzz', 'yyy']
    const ev = evaluateLine(line, [c])
    expect(ev.winner?.id).toBe(c.id)
    expect(ev.matched).toHaveLength(3)
  })

  for (const [k, L] of [
    [3, 1],
    [5, 3],
    [7, 4],
    [10, 4],
    [10, 25],
  ]) {
    it(`every spin with ${k} skills on ${L} lines is an honest evaluation of the grid`, () => {
      const rng = seeded(42 + k + L)
      const targets = roleIds.slice(0, k)
      const tset = new Set(targets)
      const field = buildField(candidates, targets, roleIds)
      for (let i = 0; i < 600; i++) {
        const r = spinField(field, L, { rng })
        expect(r.grid).toHaveLength(ROWS)
        for (const row of r.grid) expect(row).toHaveLength(REELS)
        expect(r.lines).toHaveLength(L)
        // Лучший выигрыш равен независимой оценке лучшей сети по всем линиям.
        const ev = evaluateStructure(r.grid, r.lines, tset, candidates)
        expect(r.wins[0]?.matched.length ?? 0).toBe(ev.winner ? ev.matched.length : 0)
        const people = new Set<string>()
        const usedLines = new Set<number>()
        for (const w of r.wins) {
          expect(people.has(w.candidate.id)).toBe(false)
          people.add(w.candidate.id)
          expect(w.matched.length).toBeGreaterThanOrEqual(3)
          for (const s of w.matched) {
            expect(w.candidate.skills).toContain(s)
            expect(tset.has(s)).toBe(true)
            expect(w.cells.some((c) => r.grid[c.row][c.reel] === s)).toBe(true)
          }
          // Линии разных выигрышей не повторяются, и каждая несёт совпавший навык.
          for (const id of w.lineIds) {
            expect(usedLines.has(id)).toBe(false)
            usedLines.add(id)
            const l = r.lines.find((x) => x.id === id)!
            expect(l.rows.some((row, reel) => w.matched.includes(r.grid[row][reel]))).toBe(true)
          }
        }
        // На оставшихся линиях никто из пула больше не собирает 3+.
        const rest = r.lines.filter((l) => !usedLines.has(l.id))
        if (r.wins.length < 10) expect(evaluateStructure(r.grid, rest, tset, candidates, people).winner).toBeNull()
      }
    })
  }

  it('more lines — more people per spin (honest reels)', () => {
    const targets = roleIds.slice(0, 5)
    const field = buildField(candidates, targets, roleIds)
    const perSpin = (L: number) => {
      const rng = seeded(5 + L)
      let n = 0
      for (let i = 0; i < 1500; i++) n += spinField(field, L, { rng }).wins.length
      return n / 1500
    }
    const one = perSpin(1)
    const nine = perSpin(9)
    const all = perSpin(25)
    expect(one).toBeGreaterThan(0.02)
    expect(one).toBeLessThan(0.3)
    expect(nine).toBeGreaterThan(one * 4)
    expect(all).toBeGreaterThan(nine * 1.8)
  })

  it('reel weights follow skill popularity (√ share), not flattened away', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      ...candidates[0],
      id: `p${i}`,
      skills: i < 81 ? ['react', 'css', 'html'] : ['go', 'css', 'html'],
    }))
    const m = buildReelModel(many, ['react', 'go', 'css'], ['x1', 'x2'])
    const p = (s: string) => m.probs[m.symbols.indexOf(s)]
    // React у 81 %, Go у 19 %: √-сглаживание даёт соотношение ≈ 9 : 4.36.
    expect(p('react') / p('go')).toBeCloseTo(0.9 / Math.sqrt(0.19), 1)
    expect(p('css')).toBeGreaterThan(p('go'))
  })

  it('never awards excluded candidates', () => {
    const rng = seeded(7)
    const exclude = new Set(candidates.slice(0, 30).map((c) => c.id))
    for (let i = 0; i < 1000; i++) {
      const r = generateSpin(candidates, roleIds, roleIds.slice(0, 8), 6, { rng, exclude })
      if (r.winner) expect(exclude.has(r.winner.id)).toBe(false)
    }
  })
})

describe('skills', () => {
  it('normalizes GitHub languages and topics', () => {
    expect(normalizeSkill('TypeScript')).toBe('typescript')
    expect(normalizeSkill('nextjs')).toBe('react')
    expect(normalizeSkill('HCL')).toBe('terraform')
    expect(normalizeSkill('Brainfuck')).toBeNull()
  })

  it('extracts skills from bio without false positives on short words', () => {
    expect(extractSkillsFromText('Senior React/TypeScript dev, love Kubernetes. Let us go!')).toEqual(
      expect.arrayContaining(['react', 'typescript', 'kubernetes']),
    )
    expect(extractSkillsFromText('Let us go to the moon')).toEqual([])
  })

  it('deriveSkills weights languages over topics', () => {
    const skills = deriveSkills({ bio: 'Go and Postgres fan' }, [
      { fork: false, language: 'Go', topics: ['docker', 'kubernetes'], stargazers_count: 100, description: null },
      { fork: false, language: 'Go', topics: [], stargazers_count: 3, description: null },
      { fork: true, language: 'Java', topics: [], stargazers_count: 0, description: null },
      { fork: false, language: 'Shell', topics: ['docker'], stargazers_count: 0, description: null },
    ])
    expect(skills[0]).toBe('go')
    expect(skills).toContain('postgres')
    expect(skills).toContain('docker')
    expect(skills).not.toContain('java')
  })
})

describe('json resume', () => {
  it('splits and normalizes messy keywords', () => {
    expect(normalizeKeyword('HTML/CSS').sort()).toEqual(['css', 'html'])
    expect(normalizeKeyword('React (Hooks, Redux)')).toEqual(['react'])
    expect(normalizeKeyword('GitHub Actions')).toEqual(['ci'])
    expect(normalizeKeyword('Express JS')).toEqual(['node'])
    expect(normalizeKeyword('C++')).toEqual(['cpp'])
    expect(normalizeKeyword('Watercolor')).toEqual([])
  })

  it('converts a resume into a candidate', () => {
    const raw = compactResume('jane', {
      basics: { name: 'Jane Doe', label: 'Senior Frontend Engineer', location: { city: 'Berlin', countryCode: 'DE' }, profiles: [{ network: 'LinkedIn', url: 'https://linkedin.com/in/jane' }] },
      skills: [
        { name: 'Frontend', keywords: ['React', 'TypeScript', 'HTML/CSS'] },
        { name: 'Tools', keywords: ['Docker', 'Jest'] },
      ],
      work: [{ startDate: '2016-03-01', summary: 'Built React apps' }, { startDate: '2019-01-01' }],
    })
    const c = jsonResumeToCandidate(raw)!
    expect(c.id).toBe('jr-jane')
    expect(c.url).toBe('https://registry.jsonresume.org/jane')
    expect(c.skills.slice(0, 2)).toEqual(['react', 'typescript'])
    expect(c.skills).toEqual(expect.arrayContaining(['css', 'html', 'docker', 'testing']))
    expect(c.location).toBe('Berlin, DE')
    expect(c.years).toBe(new Date().getFullYear() - 2016)
    expect(c.links?.[0].label).toBe('LinkedIn')
  })

  it('drops resumes without enough known skills', () => {
    const raw = compactResume('artist', { basics: { name: 'A' }, skills: [{ name: 'Art', keywords: ['Watercolor', 'Oil'] }] })
    expect(jsonResumeToCandidate(raw)).toBeNull()
  })
})

describe('filters & dense decks', () => {
  it('filters by skill and by free text (AND)', () => {
    const react = applyFilter(candidates, { source: 'all', filter: 'react' })
    expect(react.length).toBeGreaterThan(0)
    expect(react.every((c) => c.skills.includes('react'))).toBe(true)
    const both = applyFilter(candidates, { source: 'all', filter: 'react, frontend' })
    expect(both.every((c) => c.skills.includes('react') && c.title!.toLowerCase().includes('frontend'))).toBe(true)
    expect(applyFilter(candidates, { source: 'github', filter: '' })).toHaveLength(0)
  })

  it('evaluates the whole pool, not a deck', () => {
    const rng = seeded(11)
    const targets = roleIds.slice(0, 5)
    const field = buildField(candidates, targets, roleIds)
    const seen = new Set<string>()
    for (let i = 0; i < 3000; i++) for (const w of spinField(field, 25, { rng }).wins) seen.add(w.candidate.id)
    const eligible = candidates.filter((c) => new Set(c.skills.filter((s) => targets.includes(s))).size >= 3).length
    expect(seen.size).toBe(eligible)
  })
})

describe('skill animations', () => {
  it('assigns an animation to every skill, deterministically per position, with variety', async () => {
    const { assignFx, FX_LIST } = await import('./fx')
    const skills = roleIds.slice(0, 20)
    const a = assignFx(skills, 'all|react, typescript')
    const b = assignFx(skills, 'all|react, typescript')
    expect(a).toEqual(b)
    expect(Object.keys(a)).toHaveLength(skills.length)
    for (const s of skills) expect(FX_LIST.map((f) => f.id)).toContain(a[s])
    // Первые 8 навыков получают 8 разных анимаций.
    expect(new Set(skills.slice(0, FX_LIST.length).map((s) => a[s])).size).toBe(FX_LIST.length)
    const other = assignFx(skills, 'all|go')
    expect(skills.some((s) => other[s] !== a[s])).toBe(true)
  })
})

describe('matches through line intersections', () => {
  const c = { ...candidates[0], id: 'x', skills: ['react', 'javascript', 'typescript', 'css'] }
  const T = new Set(c.skills)
  // Спин со скриншота: React и JavaScript на линии 2, TypeScript на линии 3.
  // Линия 10 пересекает линию 2 только в клетках AWS и Angular — это не выбранные навыки.
  const grid = [
    ['php', 'postgres', 'html', 'mongodb', 'java'],
    ['testing', 'aws', 'react', 'angular', 'javascript'],
    ['python', 'docker', 'sql', 'ci', 'typescript'],
  ]

  it('lines that do not cross at a matched skill do not add up', () => {
    // Линии 1–5 и 10: TypeScript лежит на 3 и 10, но ни одна из них не пересекает линию 2 в клетке с навыком.
    const ev = evaluateStructure(grid, PAYLINES.filter((l) => [1, 2, 3, 4, 5, 10].includes(l.id)), T, [c])
    expect(ev.winner).toBeNull()
    expect(ev.nearMiss?.matched.sort()).toEqual(['javascript', 'react'])
  })

  it('lines crossing at a matched skill form one match', () => {
    // Ставим CSS в клетку, где линия 10 пересекает линию 2 (барабан 2, средний ряд): 2 и 10 связаны через CSS.
    const g = grid.map((r) => [...r])
    g[1][1] = 'css'
    const ev = evaluateStructure(g, PAYLINES.filter((l) => [1, 2, 3, 4, 5, 10].includes(l.id)), T, [c])
    expect(ev.winner?.id).toBe('x')
    expect(ev.matched.sort()).toEqual(['css', 'javascript', 'react', 'typescript'])
  })

  it('three matched skills on one line win', () => {
    const g = grid.map((r) => [...r])
    g[0] = ['react', 'php', 'css', 'java', 'typescript']
    const ev = evaluateStructure(g, linesFor(1), T, [c])
    expect(ev.matched).toHaveLength(3)
  })
})
