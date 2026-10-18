import CONFIG from './title-groups.json'

/**
 * Группы должностей по basics.label. Правила — только в src/data/title-groups.json (его проверяет человек),
 * отчёт о том, кто куда попал, — data/title-groups.md (пишет `npm run db:build`).
 */
export interface TitleGroupDef {
  id: string
  label: string
  titles: string[]
  keywords: string[]
  /** Общая группа (Software Engineer): только если должность не уточнена другой группой. */
  generic?: boolean
}

export interface TitleMatch {
  id: string
  /** Почему попал: точная должность или ключевое слово. */
  via: 'title' | 'keyword' | 'search'
  rule: string
}

/** Регистр, пунктуация и лишние пробелы не важны: «Front-End Developer!» → «front end developer», «Sr.» → «sr». */
export function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#+.]+/gu, ' ')
    .replace(/\.+(?=\s|$)/g, '') // точка в конце слова — сокращение («Sr.»), а «.NET», «Node.js» сохраняются
    .replace(/\s+/g, ' ')
    .trim()
}

const LEVELS = [...new Set((CONFIG.levels as string[]).map(normalizeTitle))].sort((a, b) => b.length - a.length)

/** Отбрасывает слова уровня в начале: «senior staff software engineer» → «software engineer». */
export function stripLevel(norm: string): string {
  let s = norm
  for (let changed = true; changed; ) {
    changed = false
    for (const l of LEVELS)
      if (s === l || s.startsWith(l + ' ')) {
        s = s.slice(l.length).trim()
        changed = true
      }
  }
  return s
}

export const TITLE_GROUPS: TitleGroupDef[] = (CONFIG.groups as TitleGroupDef[]).map((g) => ({
  ...g,
  titles: g.titles.map(normalizeTitle),
  keywords: g.keywords.map(normalizeTitle),
}))
const byId = new Map(TITLE_GROUPS.map((g) => [g.id, g]))

/** Части составной должности: «Full Stack Developer & AI Engineer» → 2 части. */
export function titleParts(label: string): string[] {
  return label
    .split(/\s[&|/·—–-]\s|[,;|/·()[\]]|\s(?:at|@)\s/i)
    .map((p) => stripLevel(normalizeTitle(p)))
    .filter(Boolean)
}

/** Группы кандидата по должности. Пусто — ни одна группа не подошла. */
export function matchTitle(label: string): TitleMatch[] {
  const whole = stripLevel(normalizeTitle(label))
  const parts = [...new Set([whole, ...titleParts(label)])]
  const out = new Map<string, TitleMatch>()
  for (const g of TITLE_GROUPS) {
    const t = parts.find((p) => g.titles.includes(p))
    if (t) {
      out.set(g.id, { id: g.id, via: 'title', rule: t })
      continue
    }
    const k = g.keywords.find((kw) => parts.some((p) => ` ${p} `.includes(` ${kw} `)))
    if (k) out.set(g.id, { id: g.id, via: 'keyword', rule: k })
  }
  // Общая группа (Software Engineer) — только если нет уточнения: «Software Engineer, Frontend» → Frontend
  const specific = [...out.values()].filter((m) => !byId.get(m.id)?.generic)
  if (specific.length) return specific
  if (out.size) return [...out.values()]
  const found = searchTitle(label)
  return found ? [found] : []
}

/** Все фразы словаря (должности и ключевые слова) — для поиска внутри длинной должности. */
const PHRASES = TITLE_GROUPS.flatMap((g) => [...g.titles, ...g.keywords].map((phrase) => ({ id: g.id, phrase })))
  // «developer», «engineer», «programmer» сами по себе ничего не уточняют — ищем только фразы и ключевые слова
  .filter((x) => x.phrase.includes(' ') || TITLE_GROUPS.find((g) => g.id === x.id)!.keywords.includes(x.phrase))

/**
 * Запасной разбор должности, которая не подошла ни к одной группе: ищем фразы словаря прямо
 * в тексте (целыми словами) и берём группу первой по тексту фразы (при равенстве — более длинной).
 * «A self-driven React developer who loves Node» → Frontend (по «react developer»).
 */
export function searchTitle(label: string): TitleMatch | null {
  const text = ` ${normalizeTitle(label)} `
  let best: { at: number; len: number; id: string; phrase: string } | null = null
  for (const { id, phrase } of PHRASES) {
    const at = text.indexOf(` ${phrase} `)
    if (at < 0) continue
    if (!best || at < best.at || (at === best.at && phrase.length > best.len)) best = { at, len: phrase.length, id, phrase }
  }
  return best ? { id: best.id, via: 'search', rule: best.phrase } : null
}

const NON_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u
/** Буквы с диакритикой, которых нет в английском: é, ñ, ç, ü, ł… */
const DIACRITIC = /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F]/
/** Частые слова должностей на испанском/португальском/французском/немецком/итальянском и т. п. без диакритики. */
const FOREIGN_WORDS = new Set(
  'de del la las los el y para com und der die des et le les en dos das von con'
    .concat(' desarrollador desarrolladora programador programadora ingeniero ingeniera analista sistemas informatica informatico')
    .concat(' desenvolvedor desenvolvedora engenheiro engenheira estudiante estudante tecnico licenciado licenciada')
    .concat(' developpeur developpeuse ingenieur ingenieure informatique logiciel etudiant entwickler softwareentwickler informatiker')
    .concat(' sviluppatore programmatore programmeur ontwikkelaar programista')
    .split(' '),
)

/** Должность не на английском — такие резюме в базу не берём. */
export function isForeignTitle(label: string): boolean {
  if (NON_LATIN.test(label) || DIACRITIC.test(label)) return true
  return normalizeTitle(label).split(' ').some((w) => FOREIGN_WORDS.has(w))
}

/** Группа для всех, чья должность не подошла ни к одной группе словаря. */
export const FALLBACK_GROUP: { id: string; label: string } = CONFIG.fallback

/** Группы кандидата: из словаря, а если ничего не подошло — общая группа (fallback). */
export function groupsForTitle(label: string): string[] {
  const m = matchTitle(label)
  return m.length ? m.map((x) => x.id) : [FALLBACK_GROUP.id]
}

export function groupLabel(id: string): string {
  return byId.get(id)?.label ?? (id === FALLBACK_GROUP.id ? FALLBACK_GROUP.label : id)
}
