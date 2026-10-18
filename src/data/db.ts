import type { Candidate } from '../game/types'
import { registerSkillLabels } from '../game/skills'

export const DB_VERSION = 3

export interface CandidateDb {
  version: number
  generatedAt: string
  counts: { jsonresume: number; github: number }
  /** Названия навыков не из словаря — как их чаще всего пишут в резюме (id → название). */
  skillLabels?: Record<string, string>
  candidates: Candidate[]
}

function isCandidate(c: any): c is Candidate {
  return c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.url === 'string' && Array.isArray(c.skills)
}

/** Грузит собранную базу (public/data/candidates.json). null — если базы нет или она битая. */
export async function loadDatabase(): Promise<CandidateDb | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/candidates.json`, { cache: 'no-cache' })
    if (!res.ok) return null
    const db = (await res.json()) as CandidateDb
    if (!db || !Array.isArray(db.candidates)) return null
    registerSkillLabels(db.skillLabels)
    return { ...db, candidates: db.candidates.filter(isCandidate) }
  } catch {
    return null
  }
}
