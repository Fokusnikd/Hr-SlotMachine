import type { Candidate, SkillId } from '../../game/types'
import { parseKeyword } from '../../game/skills'
import { groupsForTitle } from '../titleGroups'

export const JSONRESUME_REGISTRY = 'https://registry.jsonresume.org'

/** Сокращённая копия резюме, которую храним в data/raw (только то, что нужно для сборки базы). */
export interface JsonResumeRaw {
  username: string
  fetchedAt: string
  basics: {
    name?: string
    label?: string
    image?: string
    summary?: string
    url?: string
    location?: { city?: string; region?: string; countryCode?: string }
    profiles?: { network?: string; url?: string; username?: string }[]
  }
  skills: { name?: string; keywords?: string[] }[]
  /** Устаревшие поля старых снимков — больше не используются. */
  projectKeywords?: string[]
  workText?: string
  /** Самая ранняя дата начала работы (YYYY-MM-DD или YYYY). */
  firstWorkStart?: string
}

const str = (v: unknown, max = 400): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/** Превращает полный JSON Resume в компактный raw-снимок. */
export function compactResume(username: string, full: any): JsonResumeRaw {
  const b = full?.basics ?? {}
  const work = arr<any>(full?.work)
  const starts = work
    .map((w) => str(w?.startDate, 10))
    .filter((d): d is string => !!d && /^\d{4}/.test(d))
    .sort()
  return {
    username,
    fetchedAt: new Date().toISOString(),
    basics: {
      name: str(b.name, 120),
      label: str(b.label, 160),
      image: str(b.image, 300),
      summary: str(b.summary, 400),
      url: str(b.url, 300),
      location: b.location
        ? { city: str(b.location.city, 80), region: str(b.location.region, 80), countryCode: str(b.location.countryCode, 8) }
        : undefined,
      profiles: arr<any>(b.profiles)
        .slice(0, 6)
        .map((p) => ({ network: str(p?.network, 40), url: str(p?.url, 300), username: str(p?.username, 80) })),
    },
    // Все группы и все навыки, без обрезки количества
    skills: arr<any>(full?.skills).map((s) => ({
      name: str(s?.name, 400),
      keywords: arr<unknown>(s?.keywords).map((k) => str(k, 400)).filter(Boolean) as string[],
    })),
    firstWorkStart: starts[0],
  }
}

/**
 * Навыки только из поля skills, как их указал сам человек, в порядке резюме.
 * - skills[].keywords — навыки; skills[].name при этом — название группы («Frontend», «DevOps»), не навык;
 * - если keywords нет — навык записан в name.
 * Ничего не угадываем по тексту опыта/описания и не заменяем одни навыки другими; потолка на число нет.
 */
export function deriveResumeSkills(raw: JsonResumeRaw): { id: SkillId; label: string }[] {
  const out: { id: SkillId; label: string }[] = []
  const seen = new Set<SkillId>()
  const add = (text: string | undefined) => {
    if (!text) return
    for (const f of parseKeyword(text)) if (!seen.has(f.id)) (seen.add(f.id), out.push(f))
  }
  for (const group of raw.skills) {
    const keywords = (group.keywords ?? []).filter((k) => k && k.trim())
    if (keywords.length) keywords.forEach(add)
    else add(group.name)
  }
  return out
}

function yearsSince(date?: string): number | undefined {
  if (!date) return undefined
  const y = Number(date.slice(0, 4))
  const now = new Date().getFullYear()
  if (!y || y < 1970 || y > now) return undefined
  return Math.max(0, now - y)
}

function safeUrl(u?: string): string | undefined {
  if (!u) return undefined
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function jsonResumeToCandidate(raw: JsonResumeRaw): Candidate | null {
  const skills = deriveResumeSkills(raw).map((s) => s.id)
  const b = raw.basics
  // Должность только из basics.label: без неё кандидат не нужен — ничего не угадываем
  if (!b.name || !b.label || skills.length < 3) return null
  const loc = b.location
  const links = [
    ...(b.profiles ?? []).map((p) => ({ label: p.network || 'Profile', url: safeUrl(p.url) })),
    { label: 'Website', url: safeUrl(b.url) },
  ].filter((l): l is { label: string; url: string } => !!l.url)

  return {
    id: `jr-${raw.username.toLowerCase()}`,
    login: raw.username,
    name: b.name,
    avatarUrl: safeUrl(b.image),
    title: b.label,
    groups: groupsForTitle(b.label),
    location: [loc?.city, loc?.region && loc.region !== loc.city ? loc.region : undefined, loc?.countryCode].filter(Boolean).join(', ') || undefined,
    bio: b.summary,
    url: `${JSONRESUME_REGISTRY}/${encodeURIComponent(raw.username)}`,
    skills,
    source: 'jsonresume',
    years: yearsSince(raw.firstWorkStart),
    links: links.slice(0, 4),
  }
}
