import type { Candidate } from '../game/types'
import { getSkill } from '../game/skills'
import { ROLES } from './roles'
import { groupsForTitle } from './titleGroups'

/** Детерминированный ГПСЧ, чтобы демо-кандидаты не менялись между перезагрузками. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST_M = ['Alex', 'Daniel', 'Ethan', 'Max', 'Nathan', 'Arthur', 'Sam', 'Paul', 'Eric', 'Cole', 'Roman', 'Tim']
const FIRST_F = ['Anna', 'Maria', 'Kate', 'Olivia', 'Daria', 'Alina', 'Sophia', 'Paula', 'Jane', 'Vera', 'Julia', 'Irene']
const LAST = ['Smith', 'Turner', 'Cooper', 'Baker', 'Fisher', 'Newman', 'Foster', 'Wolfe', 'Byrd', 'Cole', 'Eagle', 'Hunter', 'White', 'Gray']
const CITIES = ['Berlin', 'Austin', 'Toronto', 'Warsaw', 'Lisbon', 'Bangalore', 'Singapore', 'Amsterdam', 'Dublin', 'Remote']
const BIOS = [
  'I love when the complex becomes simple.',
  "I write code that's not embarrassing to read a year later.",
  "I ship features to production and I'm not afraid of legacy code.",
  'I mentor juniors and speak at meetups.',
  'Open source by night, production by day.',
  'I automate anything I do twice.',
  'I track metrics before and after every release.',
]

function similarProfilesUrl(skills: string[]): string {
  const q = skills
    .slice(0, 2)
    .map((s) => `language:${getSkill(s).label.replace(/[^A-Za-z#+]/g, '')}`)
    .join(' ')
  return `https://github.com/search?type=users&q=${encodeURIComponent(q + ' followers:>50')}`
}

export function makeMockCandidates(count = 40, seed = 20260922): Candidate[] {
  const rng = mulberry32(seed)
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)]
  const out: Candidate[] = []
  for (let i = 0; i < count; i++) {
    const role = ROLES[i % ROLES.length]
    const female = rng() < 0.45
    const first = pick(female ? FIRST_F : FIRST_M)
    const last = pick(LAST)
    const extras = [...role.extra].sort(() => rng() - 0.5).slice(0, 2 + Math.floor(rng() * 3))
    const skills = [...new Set([...role.core, ...extras])]
    const years = 1 + Math.floor(rng() * 10)
    out.push({
      id: `mock-${i}`,
      name: `${first} ${last}`,
      title: `${role.title}, ${years} ${years === 1 ? 'year' : 'years'} of experience`,
      location: pick(CITIES),
      bio: pick(BIOS),
      url: similarProfilesUrl(skills),
      skills,
      groups: groupsForTitle(role.title),
      source: 'mock',
    })
  }
  return out
}
