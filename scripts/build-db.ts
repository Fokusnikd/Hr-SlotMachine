/**
 * Собирает базу для игры из сырых снимков: data/raw/*.json → public/data/candidates.json
 * Сеть не нужна — можно перезапускать после правок словаря навыков (src/data/skill-aliases.json).
 * Заодно пишет data/skill-merges.md — отчёт, что слилось и как разбились строки навыков.
 *
 *   npm run db:build
 *   npm run db:build -- --report   — показать самые частые навыки не из словаря (подсказка: кому добавить цвет)
 */
import { resolve } from 'node:path'
import { deriveResumeSkills, jsonResumeToCandidate, type JsonResumeRaw } from '../src/data/sources/jsonresume'
import { githubToCandidate, type GithubRaw } from '../src/data/sources/github'
import { collapse, getSkill, registerSkillLabels, skillKey, SKILLS, splitKeyword } from '../src/game/skills'
import { writeFile } from 'node:fs/promises'
import type { Candidate } from '../src/game/types'
import { DB_FILE, loadRemoved, parseArgs, RAW_DIR, readJson, writeJson } from './lib'
import { DB_VERSION, type CandidateDb } from '../src/data/db'
import { FALLBACK_GROUP, isForeignTitle, matchTitle, normalizeTitle, TITLE_GROUPS } from '../src/data/titleGroups'

/** Одно и то же имя или ровно тот же набор навыков у стольких разных логинов — шаблон из примеров (Thomas Edison, John Doe), а не человек. */
const TEMPLATE_COPIES = 4

const args = parseArgs()

const MERGES_FILE = resolve(RAW_DIR, '..', 'skill-merges.md')
const GROUPS_FILE = resolve(RAW_DIR, '..', 'title-groups.md')

async function main() {
  const removed = await loadRemoved()
  const jr = await readJson<Record<string, JsonResumeRaw | { missing: true }>>(resolve(RAW_DIR, 'jsonresume.json'), {})
  const gh = await readJson<Record<string, GithubRaw>>(resolve(RAW_DIR, 'github.json'), {})

  const byLogin = new Map<string, Candidate>()
  let jrTotal = 0
  let jrNoLabel = 0
  let jrFewSkills = 0
  let jrSameLogin = 0
  /** id навыка → написание (как в резюме) → сколько раз встретилось. Для названий и отчёта объединений. */
  const spellings = new Map<string, Map<string, number>>()
  const known = new Set(SKILLS.map((s) => s.id))
  /** Для отчёта: исходная строка навыка → что из неё получилось (только если не 1:1). */
  const splits = new Map<string, { parts: string[]; n: number }>()

  // Отсеиваем: нет должности в basics.label, меньше 3 навыков, должность не на английском,
  // шаблонные резюме (одно имя или один и тот же набор навыков у TEMPLATE_COPIES+ логинов — в копиях шаблона часто меняют имя или должность) и копии одного человека (оставляем самую полную).
  const resumes = Object.values(jr).filter((r): r is JsonResumeRaw => !('missing' in r))
  const fingerprint = (r: JsonResumeRaw) => `${normalizeTitle(r.basics.name ?? '')}|${normalizeTitle(r.basics.label ?? '')}`
  const copies = new Map<string, JsonResumeRaw[]>()
  for (const r of resumes) if (r.basics.name && r.basics.label) copies.set(fingerprint(r), [...(copies.get(fingerprint(r)) ?? []), r])
  const byName = new Map<string, number>()
  for (const r of resumes) if (r.basics.name) byName.set(normalizeTitle(r.basics.name), (byName.get(normalizeTitle(r.basics.name)) ?? 0) + 1)
  const skillSet = (r: JsonResumeRaw) => deriveResumeSkills(r).map((x) => x.id).sort().join(',')
  const bySkills = new Map<string, number>()
  for (const r of resumes) bySkills.set(skillSet(r), (bySkills.get(skillSet(r)) ?? 0) + 1)
  const skillCount = (r: JsonResumeRaw) => deriveResumeSkills(r).length
  const keepCopy = new Map([...copies].map(([k, list]) => [k, [...list].sort((a, b) => skillCount(b) - skillCount(a) || a.username.localeCompare(b.username))[0]]))
  let jrTemplates = 0
  let jrCopies = 0
  let jrForeign = 0
  const templates = new Map<string, number>()
  const foreign = new Map<string, number>()
  for (const raw of resumes) {
    if (removed.has(raw.username.toLowerCase())) continue // право на забвение — не попадает в базу, даже если ещё лежит в сыром кэше
    if (raw.basics.name && raw.basics.label) {
      const fp = fingerprint(raw)
      const n = Math.max(byName.get(normalizeTitle(raw.basics.name))!, skillSet(raw) ? bySkills.get(skillSet(raw))! : 0)
      if (n >= TEMPLATE_COPIES) {
        jrTotal++
        jrTemplates++
        const key = `${raw.basics.name} — ${raw.basics.label}`
        templates.set(key, (templates.get(key) ?? 0) + 1)
        continue
      }
      if (keepCopy.get(fp) !== raw) {
        jrTotal++
        jrCopies++
        continue
      }
      if (isForeignTitle(raw.basics.label)) {
        jrTotal++
        jrForeign++
        foreign.set(raw.basics.label, (foreign.get(raw.basics.label) ?? 0) + 1)
        continue
      }
    }
    jrTotal++
    const c = jsonResumeToCandidate(raw)
    if (!c) {
      if (!raw.basics.label) jrNoLabel++
      else jrFewSkills++
      continue
    }
    // Логины GitHub не зависят от регистра: «Br0wserz» и «br0wserz» — один аккаунт, одно резюме
    if (byLogin.has(c.login!.toLowerCase())) jrSameLogin++
    byLogin.set(c.login!.toLowerCase(), c)
    for (const { id, label } of deriveResumeSkills(raw)) {
      const m = spellings.get(id) ?? new Map<string, number>()
      m.set(label, (m.get(label) ?? 0) + 1)
      spellings.set(id, m)
    }
    for (const g of raw.skills)
      for (const text of g.keywords?.length ? g.keywords : g.name ? [g.name] : []) {
        const parts = splitKeyword(text)
        if (parts.length === 1 && parts[0] === text.trim()) continue
        const e = splits.get(text) ?? { parts, n: 0 }
        e.n++
        splits.set(text, e)
      }
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
    for (const r of raw.repos)
      for (const label of [r.language, ...(r.topics ?? [])]) {
        const id = label && skillKey(label)
        if (!id) continue
        const m = spellings.get(id) ?? new Map<string, number>()
        m.set(label!, (m.get(label!) ?? 0) + 1)
        spellings.set(id, m)
      }
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

  // Название навыка не из словаря — самое частое написание (при равенстве — где есть заглавные буквы).
  const skillLabels: Record<string, string> = {}
  for (const [id, m] of [...spellings.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!freq.has(id) || known.has(id)) continue
    const best = [...m.entries()].sort((a, b) => b[1] - a[1] || Number(/[A-Z]/.test(b[0])) - Number(/[A-Z]/.test(a[0])) || a[0].localeCompare(b[0]))[0][0]
    skillLabels[id] = best
  }
  registerSkillLabels(skillLabels)

  const db: CandidateDb = {
    version: DB_VERSION,
    generatedAt: new Date().toISOString(),
    counts: {
      jsonresume: candidates.filter((c) => c.source === 'jsonresume').length,
      github: candidates.filter((c) => c.source === 'github').length,
    },
    skillLabels,
    candidates,
  }
  await writeJson(DB_FILE, db)

  await writeFile(MERGES_FILE, mergesReport(spellings, freq, splits), 'utf8')
  await writeFile(GROUPS_FILE, groupsReport(candidates, templates, foreign), 'utf8')
  console.log(`JSON Resume: ${jrTotal} резюме → ${db.counts.jsonresume} в базе (без должности в basics.label: ${jrNoLabel}, меньше 3 навыков: ${jrFewSkills}, тот же логин в другом регистре: ${jrSameLogin}, шаблонов: ${jrTemplates}, копий одного человека: ${jrCopies}, должность не на английском: ${jrForeign})`)
  console.log(`GitHub:      ${ghTotal} профилей → ${db.counts.github} в базе (мало навыков: ${ghSkipped}, дубликатов: ${dupes})`)
  console.log(`Итого: ${candidates.length} кандидатов → ${DB_FILE}`)
  console.log(`Отчёт объединений навыков → ${MERGES_FILE}`)
  console.log(`Отчёт групп должностей → ${GROUPS_FILE}`)
  console.log(
    'Топ навыков:',
    [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([s, n]) => `${getSkill(s).label} ${n}`)
      .join(', '),
  )
  if (args.report) {
    console.log('\nЧастые навыки не из словаря (src/data/skill-aliases.json):')
    for (const [id, m] of [...spellings.entries()].filter(([id]) => !known.has(id)).sort((a, b) => (freq.get(b[0]) ?? 0) - (freq.get(a[0]) ?? 0)).slice(0, 60))
      console.log(`  ${freq.get(id) ?? 0}\t${id}\t${[...m.keys()].slice(0, 5).join(' | ')}`)
  }
}

/**
 * Отчёт для проверки человеком: что на реальных данных слилось в один навык и как разбились строки.
 * Ничего не меняет — только показывает.
 */
function mergesReport(
  spellings: Map<string, Map<string, number>>,
  freq: Map<string, number>,
  splits: Map<string, { parts: string[]; n: number }>,
): string {
  const known = new Map(SKILLS.map((s) => [s.id, s]))
  const out: string[] = []
  const cell = (t: string) => t.replace(/\|/g, '\\|')
  const variants = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${cell(t)} ×${n}`).join(', ')

  out.push('# Объединения навыков (генерируется `npm run db:build`, руками не править)')
  out.push('')
  out.push('Правила: по словарю `src/data/skill-aliases.json` сливаются только перечисленные там написания; ')
  out.push('кроме этого сливаются написания, отличающиеся лишь регистром, пробелами, точками, дефисами и подчёркиваниями.')
  out.push('Число после × — сколько кандидатов написали именно так.')
  out.push('')

  const byDict: string[] = []
  const byNorm: string[] = []
  for (const [id, m] of [...spellings.entries()].sort((a, b) => (freq.get(b[0]) ?? 0) - (freq.get(a[0]) ?? 0))) {
    const def = known.get(id)
    if (def) {
      // Написания, которые попали сюда именно по aliases (а не совпали с названием с точностью до регистра/пунктуации)
      const viaAlias = [...m.keys()].filter((t) => collapse(t) !== collapse(def.label))
      if (viaAlias.length) byDict.push(`| ${cell(def.label)} | \`${id}\` | ${variants(m)} |`)
      else if (m.size > 1) byNorm.push(`| ${cell(def.label)} | ${variants(m)} |`)
    } else if (m.size > 1) byNorm.push(`| ${cell(getSkill(id).label)} | ${variants(m)} |`)
  }
  out.push(`## 1. Слито по словарю skill-aliases.json (${byDict.length})`)
  out.push('')
  out.push('| Навык | id | Встретившиеся написания |')
  out.push('|---|---|---|')
  out.push(...byDict)
  out.push('')
  out.push(`## 2. Слито только по регистру / пробелам / точкам / дефисам (${byNorm.length})`)
  out.push('')
  out.push('| Навык (как показывается) | Встретившиеся написания |')
  out.push('|---|---|')
  out.push(...byNorm)
  out.push('')

  const sorted = [...splits.entries()].sort((a, b) => b[1].n - a[1].n)
  const dropped = sorted.filter(([, e]) => e.parts.length === 0)
  const changed = sorted.filter(([, e]) => e.parts.length > 0)
  out.push(`## 3. Строки, которые разбиты или почищены (${changed.length})`)
  out.push('')
  out.push('Запятые / ; / | / • — список; «/», «&», «and» — делят, если хотя бы одна часть известна и нет обрывков; из скобок берутся только известные навыки.')
  out.push('')
  out.push('| Строка в резюме | Что получилось | × |')
  out.push('|---|---|---|')
  for (const [t, e] of changed) out.push(`| ${cell(t)} | ${e.parts.map(cell).join(' · ')} | ${e.n} |`)
  out.push('')
  out.push(`## 4. Строки, не принятые за навык (длиннее 40 символов или больше 4 слов) (${dropped.length})`)
  out.push('')
  out.push('| Строка в резюме | × |')
  out.push('|---|---|')
  for (const [t, e] of dropped) out.push(`| ${cell(t)} | ${e.n} |`)
  out.push('')
  return out.join('\n')
}

/** Отчёт для проверки человеком: какие должности попали в какую группу и по какому правилу. */
function groupsReport(candidates: Candidate[], templates: Map<string, number>, foreign: Map<string, number>): string {
  const cell = (t: string) => t.replace(/\|/g, '\\|')
  // группа → должность как написана → { сколько, правило }
  const byGroup = new Map<string, Map<string, { n: number; rule: string }>>()
  const fallback = new Map<string, number>()
  let multi = 0
  for (const c of candidates) {
    if (!c.title) continue
    const m = matchTitle(c.title)
    if (m.length > 1) multi++
    if (!m.length) {
      fallback.set(c.title, (fallback.get(c.title) ?? 0) + 1)
      continue
    }
    for (const x of m) {
      const e = byGroup.get(x.id) ?? new Map<string, { n: number; rule: string }>()
      const prev = e.get(c.title)
      e.set(c.title, { n: (prev?.n ?? 0) + 1, rule: x.via === 'title' ? `должность «${x.rule}»` : x.via === 'keyword' ? `слово «${x.rule}»` : `поиск «${x.rule}» в тексте` })
      byGroup.set(x.id, e)
    }
  }
  const total = (m: Map<string, { n: number }>) => [...m.values()].reduce((a, v) => a + v.n, 0)
  const fbTotal = [...fallback.values()].reduce((a, n) => a + n, 0)
  const out: string[] = []
  out.push('# Группы должностей (генерируется `npm run db:build`, руками не править)')
  out.push('')
  out.push('Правила — `src/data/title-groups.json`. Кандидат может быть в нескольких группах' + ` (таких ${multi}).`)
  out.push(`Группа — набор навыков её людей; пул людей в игре группа не ограничивает. Если должность не подошла ни к одной группе даже после поиска фраз словаря в тексте — кандидат попадает в «${FALLBACK_GROUP.label}» (раздел 2).`)
  out.push('')
  out.push('## 1. Группы из словаря')
  out.push('')
  out.push('| Группа | Кандидатов | Разных должностей |')
  out.push('|---|---|---|')
  for (const g of TITLE_GROUPS) {
    const m = byGroup.get(g.id)
    out.push(`| ${cell(g.label)} | ${m ? total(m) : 0} | ${m?.size ?? 0} |`)
  }
  out.push(`| ${cell(FALLBACK_GROUP.label)} (не подошли к словарю) | ${fbTotal} | ${fallback.size} |`)
  out.push('')
  for (const g of TITLE_GROUPS) {
    const m = byGroup.get(g.id)
    if (!m) continue
    out.push(`### ${g.label} (${total(m)})`)
    out.push('')
    out.push('| Должность в резюме | × | Правило |')
    out.push('|---|---|---|')
    for (const [t, e] of [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) out.push(`| ${cell(t)} | ${e.n} | ${e.rule} |`)
    out.push('')
  }
  out.push(`## 2. ${FALLBACK_GROUP.label} — должность не подошла к словарю (${fbTotal} кандидатов, ${fallback.size} разных должностей)`)
  out.push('')
  out.push('Чтобы перенести кого-то в нормальную группу — добавьте должность в `titles` или слово в `keywords` нужной группы.')
  out.push('')
  out.push('| Должность в резюме | × |')
  out.push('|---|---|')
  for (const [t, n] of [...fallback.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) out.push(`| ${cell(t)} | ${n} |`)
  out.push('')
  out.push(`## 3. Выброшено: шаблонные резюме (${[...templates.values()].reduce((a, n) => a + n, 0)})`)
  out.push('')
  out.push(`Одно и то же имя или тот же набор навыков у ${TEMPLATE_COPIES}+ разных логинов — копии примера, а не люди.`)
  out.push('')
  out.push('| Имя — должность | Выброшено |')
  out.push('|---|---|')
  for (const [t, n] of [...templates.entries()].sort((a, b) => b[1] - a[1])) out.push(`| ${cell(t)} | ${n} |`)
  out.push('')
  out.push(`## 4. Выброшено: должность не на английском (${[...foreign.values()].reduce((a, n) => a + n, 0)})`)
  out.push('')
  out.push('| Должность в резюме | × |')
  out.push('|---|---|')
  for (const [t, n] of [...foreign.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) out.push(`| ${cell(t)} | ${n} |`)
  out.push('')
  return out.join('\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
