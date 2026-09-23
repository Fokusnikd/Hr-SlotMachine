import type { Candidate, SkillId } from '../../game/types'
import { extractSkillsFromText, normalizeSkill } from '../../game/skills'
import { guessTitle } from '../roles'

// GITHUB_API_URL — для тестов сборщика на локальном мок-сервере
const API = (typeof process !== 'undefined' && process.env?.GITHUB_API_URL) || 'https://api.github.com'

export class RateLimitError extends Error {
  constructor(public resetAt: number | null) {
    super('GitHub API rate limit exceeded')
  }
}

export interface GhUser {
  login: string
  id: number
  name: string | null
  avatar_url: string
  html_url: string
  blog?: string | null
  bio: string | null
  location: string | null
  company: string | null
  public_repos: number
  followers: number
  created_at?: string
  type?: string
}

export interface GhRepo {
  fork: boolean
  language: string | null
  topics?: string[]
  stargazers_count: number
  description: string | null
}

/** Снимок профиля, который храним в data/raw/github.json. */
export interface GithubRaw {
  fetchedAt: string
  user: GhUser
  repos: GhRepo[]
}

export async function gh<T>(path: string, token?: string, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'hrgacha-collector' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(API + path, { headers, signal })
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const reset = res.headers.get('x-ratelimit-reset')
    const retryAfter = res.headers.get('retry-after')
    // 403 от GitHub почти всегда — первичный или вторичный rate limit
    if (remaining === '0' || remaining === null || res.status === 429 || retryAfter) {
      const resetAt = reset ? Number(reset) * 1000 : retryAfter ? Date.now() + Number(retryAfter) * 1000 : null
      throw new RateLimitError(resetAt)
    }
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`)
  return res.json() as Promise<T>
}

/** Превращает профиль + репозитории в набор навыков, отсортированный по весу. */
export function deriveSkills(user: Pick<GhUser, 'bio'>, repos: GhRepo[]): SkillId[] {
  const score = new Map<SkillId, number>()
  const add = (id: SkillId | null, w: number) => id && score.set(id, (score.get(id) ?? 0) + w)
  for (const r of repos) {
    if (r.fork) continue
    const starBoost = 1 + Math.min(2, Math.log10(1 + r.stargazers_count) / 2)
    add(normalizeSkill(r.language), 2 * starBoost)
    for (const t of r.topics ?? []) add(normalizeSkill(t), 1)
    for (const s of extractSkillsFromText(r.description)) add(s, 0.3)
  }
  for (const s of extractSkillsFromText(user.bio)) add(s, 4)
  return [...score.entries()]
    .filter(([, w]) => w >= 1.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([s]) => s)
}

export async function searchUsers(query: string, page: number, perPage: number, token?: string): Promise<string[]> {
  const q = encodeURIComponent(`${query} type:user`.trim())
  const res = await gh<{ items: { login: string }[] }>(`/search/users?q=${q}&per_page=${perPage}&page=${page}`, token)
  return res.items.map((i) => i.login)
}

export async function fetchGithubRaw(login: string, token?: string): Promise<GithubRaw> {
  const [user, repos] = await Promise.all([
    gh<GhUser>(`/users/${login}`, token),
    gh<GhRepo[]>(`/users/${login}/repos?per_page=100&sort=pushed&type=owner`, token),
  ])
  return {
    fetchedAt: new Date().toISOString(),
    user: {
      login: user.login,
      id: user.id,
      name: user.name,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
      blog: user.blog,
      bio: user.bio,
      location: user.location,
      company: user.company,
      public_repos: user.public_repos,
      followers: user.followers,
      created_at: user.created_at,
    },
    repos: repos.map((r) => ({
      fork: r.fork,
      language: r.language,
      topics: r.topics?.slice(0, 12),
      stargazers_count: r.stargazers_count,
      description: r.description?.slice(0, 200) ?? null,
    })),
  }
}

export function githubToCandidate(raw: GithubRaw): Candidate | null {
  const { user, repos } = raw
  const skills = deriveSkills(user, repos)
  if (skills.length < 3) return null
  const blog = user.blog ? (user.blog.startsWith('http') ? user.blog : `https://${user.blog}`) : undefined
  return {
    id: `gh-${user.id}`,
    login: user.login,
    name: user.name || user.login,
    avatarUrl: user.avatar_url,
    title: guessTitle(skills),
    location: user.location ?? undefined,
    company: user.company?.replace(/^@/, '') ?? undefined,
    bio: user.bio ?? undefined,
    url: user.html_url,
    skills,
    source: 'github',
    stats: { repos: user.public_repos, followers: user.followers },
    links: blog ? [{ label: 'Website', url: blog }] : undefined,
  }
}
