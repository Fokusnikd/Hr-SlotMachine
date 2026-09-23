/**
 * Симуляция честных барабанов: частота выигрышей, людей за спин и распределение совпадений
 * по числу линий и навыков. Запуск: npx tsx scripts/sim.ts [spins] [targetShare]
 */
import { readFileSync } from 'node:fs'
import { buildField, spinField, topSkills } from '../src/game/outcome'
import type { Candidate } from '../src/game/types'
import { bonusChance, payScaleTable } from '../src/game/calibrate'
import { CONSOLATION_SPINS, winChance } from '../src/game/bonus'
import { payoutFor, scaleForLines, spinCost } from '../src/game/economy'

const db = JSON.parse(readFileSync('public/data/candidates.json', 'utf8'))
const all: Candidate[] = db.candidates
const SPINS = Number(process.argv[2] ?? 3000)
const share = process.argv[3] ? Number(process.argv[3]) : undefined
const role = topSkills(all, 20).map((s) => s.id)

const configs: [string, Candidate[], string[]][] = [
  ['top3', all, role.slice(0, 3)],
  ['top5', all, role.slice(0, 5)],
  ['front5', all, ['react', 'typescript', 'css', 'javascript', 'html']],
  ['top10', all, role.slice(0, 10)],
  ['rare5', all, ['go', 'rust', 'kotlin', 'swift', 'graphql']],
]
for (const [name, cands, targets] of configs) {
  const field = buildField(cands, targets, role, share)
  const table = payScaleTable(field)
  const freq = targets.map((t, i) => `${t}:${(field.model.probs[i] * 100).toFixed(0)}%`).join(' ')
  console.log(`\n${name} (${freq}; бонус 1/${(1 / bonusChance(field)).toFixed(0)}; групп ${field.groups.length}; ×3 на 1/9/25 линиях = +${[1, 9, 25].map((l) => payoutFor(3, scaleForLines(table, l))).join('/')})`)
  for (const lines of [1, 4, 9, 15, 25]) {
    let spinsWon = 0, people = 0, paid = 0, bonuses = 0, bonusPaid = 0
    const byM: Record<number, number> = {}
    for (let i = 0; i < SPINS; i++) {
      const r = spinField(field, lines)
      if (r.wins.length) spinsWon++
      people += r.wins.length
      for (const w of r.wins) paid += payoutFor(w.matched.length, scaleForLines(table, lines))
      for (const w of r.wins) byM[w.matched.length] = (byM[w.matched.length] ?? 0) + 1
      if (r.bonus) {
        bonuses++
        const gain = Math.random() < winChance(r.bonus) ? payoutFor(Math.max(3, field.bestMatch), scaleForLines(table, lines)) : CONSOLATION_SPINS * spinCost(lines)
        paid += gain
        bonusPaid += gain
      }
    }
    const dist = Object.entries(byM).map(([m, n]) => `×${m}:${((n / people) * 100).toFixed(0)}%`).join(' ')
    console.log(`  ${String(lines).padStart(2)} лин: выигрыш ${((spinsWon / SPINS) * 100).toFixed(1).padStart(5)}% · людей/спин ${(people / SPINS).toFixed(2)} · бонусов ${bonuses} (доля RTP ${(bonusPaid / SPINS / spinCost(lines)).toFixed(2)}) · RTP ${(paid / SPINS / spinCost(lines)).toFixed(2)} · ${dist}`)
  }
}
