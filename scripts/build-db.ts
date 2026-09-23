/**
 * Собирает базу для игры из сырых снимков: data/raw/*.json → public/data/candidates.json
 * Сеть не нужна — можно перезапускать после правок словаря навыков (src/game/skills.ts).
 *
 *   npm run db:build
 *   npm run db:build -- --report   — показать самые частые НЕраспознанные навыки (подсказка для словаря)
 */
import { resolve } from 'node:path'
import { jsonResumeToCandidate, type JsonResumeRaw } from '../src/data/sources/jsonresume'
import { githubToCandidate, type GithubRaw } from '../src/data/sources/github'
import { normalizeKeyword, getSkill } from '../src/game/skills'
import type { Candidate } from '../src/game/types'
import { DB_FILE, loadRemoved, parseArgs, RAW_DIR, readJson, writeJson } from './lib'
import { DB_VERSION, type CandidateDb } from '../src/data/db'

const args = parseArgs()

/** Имена из шаблонов резюме — это не реальные люди. */
const PLACEHOLDER_NAMES = new Set(['john doe', 'jane doe', 'richard hendriks', 'thomas edison', 'your name', 'lorem ipsum', 'firstname lastname', 'name surname'])

async function main() {
  const removed = await loadRemoved()
  const jr = await readJson<Record<string, JsonResumeRaw | { missing: true }>>(resolve(RAW_DIR, 'jsonresume.json'), {})
  const gh = await readJson<Record<string, GithubRaw>>(resolve(RAW_DIR, 'github.json'), {})

  const byLogin = new Map<string, Candidate>()
  let jrTotal = 0
  let jrSkipped = 0
  let jrDupes = 0
  const seen = new Set<string>()
  const unknown = new Map<string, number>()

  for (const raw of Object.values(jr)) {
    if ('missing' in raw) continue
    if (removed.has(raw.username.toLowerCase())) continue // право на забвение — не попадает в базу, даже если ещё лежит в сыром кэше
    jrTotal++
    const c = jsonResumeToCandidate(raw)
    if (!c || PLACEHOLDER_NAMES.has(c.name.trim().toLowerCase())) {
      jrSkipped++
      continue
    }
    // Одно и то же резюме, загруженное под разными логинами
    const fingerprint = `${c.name.trim().toLowerCase()}|${[...c.skills].sort().join(',')}`
    if (seen.has(fingerprint)) {
      jrDupes++
      continue
    }
    seen.add(fingerprint)
    byLogin.set(c.login!.toLowerCase(), c)
    if (args.report)
      for (const g of raw.skills)
        for (const k of g.keywords ?? []) if (!normalizeKeyword(k).length) unknown.set(k.toLowerCase(), (unknown.get(k.toLowerCase()) ?? 0) + 1)
  }

  let ghTotal = 0
  let ghSkipped = 0
  let dupes = 0
  for (const raw of Object.values(gh)) {
    if (removed.has(raw.user.login.toLowerCase())) continue // право на забвение
    ghTotal++
    const c = githubToCandidate(raw)
    if (!c) {
      ghSkipped++
      continue
    }
    // Реестр JSON Resume построен на GitHub-логинах: один и тот же человек может быть в обоих источниках.
    // Оставляем резюме (там навыки указаны самим человеком), а GitHub добавляем ссылкой.
    const key = c.login!.toLowerCase()
    const existing = byLogin.get(key)
    if (existing) {
      dupes++
      existing.links = [...(existing.links ?? []), { label: 'GitHub', url: c.url }].slice(0, 5)
      existing.stats = c.stats
      continue
    }
    byLogin.set(key, c)
  }

  const candidates = [...byLogin.values()].sort((a, b) => a.id.localeCompare(b.id))
  const freq = new Map<string, number>()
  for (const c of candidates) for (const s of c.skills) freq.set(s, (freq.get(s) ?? 0) + 1)

  const db: CandidateDb = {
    version: DB_VERSION,
    generatedAt: new Date().toISOString(),
    counts: {
      jsonresume: candidates.filter((c) => c.source === 'jsonresume').length,
      github: candidates.filter((c) => c.source === 'github').length,
    },
    candidates,
  }
  await writeJson(DB_FILE, db)

  console.log(`JSON Resume: ${jrTotal} резюме → ${db.counts.jsonresume} в базе (без 3+ известных навыков или шаблонных: ${jrSkipped}, копий: ${jrDupes})`)
  console.log(`GitHub:      ${ghTotal} профилей → ${db.counts.github} в базе (мало навыков: ${ghSkipped}, дубликатов: ${dupes})`)
  console.log(`Итого: ${candidates.length} кандидатов → ${DB_FILE}`)
  console.log(
    'Топ навыков:',
    [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([s, n]) => `${getSkill(s).label} ${n}`)
      .join(', '),
  )
  if (args.report) {
    console.log('\nЧастые нераспознанные навыки (кандидаты в алиасы src/game/skills.ts):')
    for (const [k, n] of [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`  ${n}\t${k}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
