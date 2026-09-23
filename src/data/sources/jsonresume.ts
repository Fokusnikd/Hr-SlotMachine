import type { Candidate, SkillId } from '../../game/types'
import { extractSkillsFromText, normalizeKeyword } from '../../game/skills'
import { guessTitle } from '../roles'

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
  projectKeywords: string[]
  /** Склеенные summary/highlights из опыта работы (обрезано). */
  workText: string
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
    skills: arr<any>(full?.skills)
      .slice(0, 40)
      .map((s) => ({ name: str(s?.name, 120), keywords: arr<unknown>(s?.keywords).map((k) => str(k, 80)).filter(Boolean).slice(0, 40) as string[] })),
    projectKeywords: arr<any>(full?.projects)
      .flatMap((p) => arr<unknown>(p?.keywords))
      .map((k) => str(k, 60))
      .filter(Boolean)
      .slice(0, 60) as string[],
    workText: work
      .flatMap((w) => [str(w?.position, 120), str(w?.summary, 600), ...arr<unknown>(w?.highlights).map((h) => str(h, 300))])
      .filter(Boolean)
      .join(' \n ')
      .slice(0, 2500),
    firstWorkStart: starts[0],
  }
}

export function deriveResumeSkills(raw: JsonResumeRaw): SkillId[] {
  const score = new Map<SkillId, number>()
  const add = (ids: SkillId[], w: number) => ids.forEach((id) => score.set(id, (score.get(id) ?? 0) + w))

  raw.skills.forEach((group, gi) => {
    const pos = Math.max(0.6, 1 - gi * 0.05) // первые группы обычно главные
    if (group.name) add(normalizeKeyword(group.name), 1 * pos)
    for (const k of group.keywords ?? []) add(normalizeKeyword(k), 2 * pos)
  })
  for (const k of raw.projectKeywords) add(normalizeKeyword(k), 1)
  add(extractSkillsFromText(raw.basics.label), 2)
  add(extractSkillsFromText(raw.basics.summary), 1)
  // Опыт работы: каждое упоминание весит мало, но много упоминаний — сигнал.
  const text = raw.workText.toLowerCase()
  for (const id of extractSkillsFromText(raw.workText)) {
    const mentions = Math.min(4, text.split(id).length - 1 || 1)
    add([id], 0.6 * mentions)
  }

  return [...score.entries()]
    .filter(([, w]) => w >= 1.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([s]) => s)
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
  const skills = deriveResumeSkills(raw)
  const b = raw.basics
  if (!b.name || skills.length < 3) return null
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
    title: b.label || guessTitle(skills),
    location: [loc?.city, loc?.region && loc.region !== loc.city ? loc.region : undefined, loc?.countryCode].filter(Boolean).join(', ') || undefined,
    bio: b.summary,
    url: `${JSONRESUME_REGISTRY}/${encodeURIComponent(raw.username)}`,
    skills,
    source: 'jsonresume',
    years: yearsSince(raw.firstWorkStart),
    links: links.slice(0, 4),
  }
}
