import type { SkillId } from './types'
import ALIASES from '../data/skill-aliases.json'

export interface SkillDef {
  id: SkillId
  label: string
  color: string
  /** Другие НАПИСАНИЯ того же навыка (в нижнем регистре). Никогда — другие технологии. */
  aliases: string[]
}


/** Цвета плашек известных навыков. Навыки без цвета красятся по хешу id. */
const COLORS: Record<SkillId, string> = {
  typescript: '#3178c6',
  javascript: '#e8c547',
  python: '#3a76a8',
  go: '#00add8',
  rust: '#ce6a3a',
  java: '#b07219',
  kotlin: '#a97bff',
  swift: '#f05138',
  csharp: '#6a40c2',
  cpp: '#f34b7d',
  c: '#7a8a99',
  php: '#6f7fbf',
  ruby: '#cc342d',
  scala: '#dc322f',
  elixir: '#8a5fa8',
  dart: '#00b4ab',
  lua: '#000080',
  haskell: '#5e5086',
  r: '#276dc3',
  sql: '#e38c00',
  html: '#e34c26',
  css: '#663399',
  bash: '#4eaa25',
  react: '#61dafb',
  nextjs: '#111111',
  reactnative: '#4fc3f7',
  redux: '#764abc',
  vue: '#42b883',
  nuxt: '#00dc82',
  angular: '#dd0031',
  angularjs: '#b52e31',
  svelte: '#ff3e00',
  jquery: '#0769ad',
  sass: '#cc6699',
  tailwind: '#38bdf8',
  bootstrap: '#7952b3',
  webpack: '#8dd6f9',
  threejs: '#9aa7b8',
  graphql: '#e10098',
  node: '#5fa04e',
  express: '#6b6b6b',
  nestjs: '#e0234e',
  django: '#0c4b33',
  flask: '#3b3b3b',
  fastapi: '#009688',
  spring: '#6db33f',
  springboot: '#5fa134',
  laravel: '#ff2d20',
  rails: '#cc0000',
  dotnet: '#512bd4',
  rest: '#5a6b7b',
  postgres: '#4169e1',
  mysql: '#00758f',
  sqlite: '#0f80cc',
  mongodb: '#47a248',
  redis: '#dc382d',
  elasticsearch: '#fec514',
  kafka: '#8a8a8a',
  rabbitmq: '#ff6600',
  pandas: '#150458',
  numpy: '#4dabcf',
  spark: '#e25a1c',
  docker: '#2496ed',
  kubernetes: '#326ce5',
  aws: '#ff9900',
  azure: '#0078d4',
  gcp: '#4285f4',
  firebase: '#ffa000',
  terraform: '#7b42bc',
  ansible: '#ee0000',
  linux: '#fcc624',
  nginx: '#009639',
  git: '#f05032',
  github: '#24292f',
  ci: '#2088ff',
  jenkins: '#d24939',
  devops: '#0e7fbf',
  ml: '#ff6f00',
  ai: '#10a37f',
  deeplearning: '#d35400',
  pytorch: '#ee4c2c',
  tensorflow: '#ff8f00',
  llm: '#7c3aed',
  android: '#3ddc84',
  ios: '#8e8e93',
  flutter: '#02569b',
  unity: '#9a9a9a',
  figma: '#f24e1e',
  jest: '#99425b',
  testing: '#99425b',
  security: '#c0392b',
  blockchain: '#3c3c3d',
  agile: '#2e8b57',
  jira: '#0052cc',
  monitoring: '#f46800',
  data: '#150458',
}

/**
 * Известные навыки: id, название и другие написания — из src/data/skill-aliases.json
 * (единственное место, где описаны объединения; его проверяет человек).
 */
export const SKILLS: SkillDef[] = (ALIASES.skills as { id: string; label: string; aliases: string[] }[]).map((s) => ({
  id: s.id,
  label: s.label,
  color: COLORS[s.id] ?? hashColor(s.id),
  aliases: [s.label.toLowerCase(), ...s.aliases.map((a) => a.toLowerCase())],
}))

/** Схлопывает написание: регистр, пробелы, точки, дефисы, подчёркивания. «Node.js» / «node js» / «NodeJS» → «nodejs». */
export function collapse(raw: string): string {
  return raw.normalize('NFKC').toLowerCase().trim().replace(/[\s._\-]+/g, '')
}

const byId = new Map(SKILLS.map((s) => [s.id, s]))
const byAlias = new Map<string, SkillId>()
for (const s of SKILLS)
  for (const a of s.aliases) {
    const k = collapse(a)
    const prev = byAlias.get(k)
    if (prev && prev !== s.id) throw new Error(`skill-aliases.json: написание «${a}» указано и у «${prev}», и у «${s.id}»`)
    byAlias.set(k, s.id)
  }

/** Названия навыков не из словаря (как они написаны в резюме). Заполняется из базы при загрузке. */
const extraLabels = new Map<SkillId, string>()
export function registerSkillLabels(labels: Record<SkillId, string> | undefined) {
  if (labels) for (const [id, label] of Object.entries(labels)) if (!byId.has(id)) extraLabels.set(id, label)
}

function hashColor(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = h % 360
  // HSL → hex, средняя насыщенность/яркость, чтобы и тёмный, и светлый текст читались
  const s = 0.55
  const l = 0.5
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function getSkill(id: SkillId): SkillDef {
  return byId.get(id) ?? { id, label: extraLabels.get(id) ?? id, color: hashColor(id), aliases: [id] }
}

/** Навык есть в словаре. */
export function isKnownSkill(raw: string): boolean {
  return byAlias.has(collapse(raw))
}

/**
 * Ключ навыка: словарный id, если это известное написание, иначе схлопнутое написание как есть.
 * Навык никогда не превращается в ДРУГОЙ навык. null — если это не похоже на навык.
 */
export function skillKey(raw: string | null | undefined): SkillId | null {
  if (!raw) return null
  const k = collapse(raw)
  if (!k || !/[\p{L}\p{N}]/u.test(k)) return null
  const known = byAlias.get(k)
  if (known) return known
  // Написание не из словаря, случайно совпавшее с внутренним id («ML» и id Machine Learning = «ml») —
  // НЕ сливаем молча: слить можно только через aliases в skill-aliases.json.
  return byId.has(k) ? `${k}_` : k
}

/** Ключ навыка, только если он известен — из словаря или из загруженной базы. Для поиска по фильтру. */
export function normalizeSkill(raw: string | null | undefined): SkillId | null {
  const k = skillKey(raw)
  if (!k) return null
  return byId.has(k) || extraLabels.has(k) ? k : null
}

/** Короткая строка похожа на название навыка, а не на предложение. */
function skillLike(s: string): boolean {
  return s.length > 0 && s.length <= 40 && s.split(/\s+/).length <= 4 && /[\p{L}\p{N}]/u.test(s)
}

/**
 * Резюме пишут навыки как угодно: "HTML/CSS", "React (Hooks, Redux)", "AWS, GCP".
 * - запятая / точка с запятой / | / • — всегда разделитель списка;
 * - «/», «&», «and» делят, если хотя бы одна часть — известный навык, а остальные не обрывки
 *   («HTML/CSS», «React/Next» → 2; «CI/CD», «UI/UX», «PL/SQL», «TCP/IP», «A/B testing» — целиком);
 * - из скобок берём только известные навыки («React (Hooks, Redux)» → React, Redux), пояснения вроде «(advanced)» отбрасываем.
 * Возвращает исходные написания (для названий) — ключи получаются через skillKey.
 */
export function splitKeyword(raw: string): string[] {
  const inner: string[] = []
  const outer = raw.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (_m, a?: string, b?: string) => {
    inner.push(a ?? b ?? '')
    return ' '
  })
  const out: string[] = []
  for (const part of outer.split(/[,;|•·\n]/)) out.push(...splitPart(part))
  // Из скобок — только известные навыки: «(Hooks, Redux)» → Redux, «(CI/CD)» → CI/CD, «(advanced)» — пояснение
  for (const text of inner) for (const part of text.split(/[,;|•·]/)) out.push(...splitPart(part).filter(isKnownSkill))
  return out.filter(skillLike)
}

/** Один элемент списка: целиком, либо разбитый по «/», «&», «and». */
function splitPart(part: string): string[] {
  const p = part.replace(/\s+/g, ' ').replace(/^[\s\-–—*:]+|[\s\-–—*:.]+$/g, '')
  if (!p) return []
  if (isKnownSkill(p)) return [p] // «CI/CD», «Ruby on Rails» — известное написание целиком
  const sub = p.split(/\s*(?:\/|&|\band\b)\s*/i).map((q) => q.trim())
  if (sub.length < 2 || sub.some((q) => !q)) return [p]
  // Делим, если хотя бы одна часть — известный навык, а остальные не обрывки («HTML/CSS», «React/Next»;
  // «UI/UX», «PL/SQL», «TCP/IP», «A/B testing» — целиком) …
  if (sub.some(isKnownSkill) && sub.every((q) => q.length >= 3 || isKnownSkill(q))) return sub
  // … или если целиком это слишком длинно для навыка, а части через «/» или «&» — нормальные навыки
  // («Notion / Telegram / Discord», «Azure AD / Entra ID»): иначе строка пропала бы целиком.
  // Только по «/» и «&» — «and» в длинной строке чаще связывает слова фразы, а не навыки.
  const bySlash = p.split(/\s*[/&]\s*/).map((q) => q.trim())
  if (!skillLike(p) && bySlash.length > 1 && bySlash.every(skillLike)) return bySlash
  return [p]
}

/** Навыки из одного поля резюме: ключ + написание, как у автора (для названия навыка не из словаря). */
export function parseKeyword(raw: string): { id: SkillId; label: string }[] {
  const found: { id: SkillId; label: string }[] = []
  for (const part of splitKeyword(raw)) {
    const id = skillKey(part)
    if (id && !found.some((f) => f.id === id)) found.push({ id, label: part })
  }
  return found
}

/** Ключи навыков из одного поля резюме. */
export function normalizeKeyword(raw: string): SkillId[] {
  return parseKeyword(raw).map((f) => f.id)
}
