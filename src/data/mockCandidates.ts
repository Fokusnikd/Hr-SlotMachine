import type { Candidate } from '../game/types'
import { getSkill } from '../game/skills'
import { ROLES } from './roles'

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

const FIRST_M = ['Алексей', 'Дмитрий', 'Иван', 'Максим', 'Никита', 'Артём', 'Сергей', 'Павел', 'Егор', 'Кирилл', 'Роман', 'Тимур']
const FIRST_F = ['Анна', 'Мария', 'Екатерина', 'Ольга', 'Дарья', 'Алина', 'Софья', 'Полина', 'Ксения', 'Вера', 'Юлия', 'Ирина']
const LAST = ['Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Соколов', 'Новиков', 'Морозов', 'Волков', 'Лебедев', 'Козлов', 'Орлов', 'Зайцев', 'Белов', 'Громов']
const CITIES = ['Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург', 'Нижний Новгород', 'Алматы', 'Тбилиси', 'Белград', 'Удалённо']
const BIOS = [
  'Люблю, когда сложное становится простым.',
  'Пишу код, который не стыдно читать через год.',
  'Довожу фичи до прода и не боюсь легаси.',
  'Менторю джунов, выступаю на митапах.',
  'Open source по вечерам, продакшен днём.',
  'Автоматизирую всё, что делается дважды.',
  'Считаю метрики до и после каждого релиза.',
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
    const last = pick(LAST) + (female ? 'а' : '')
    const extras = [...role.extra].sort(() => rng() - 0.5).slice(0, 2 + Math.floor(rng() * 3))
    const skills = [...new Set([...role.core, ...extras])]
    const years = 1 + Math.floor(rng() * 10)
    out.push({
      id: `mock-${i}`,
      name: `${first} ${last}`,
      title: `${role.title}, ${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'} опыта`,
      location: pick(CITIES),
      bio: pick(BIOS),
      url: similarProfilesUrl(skills),
      skills,
      source: 'mock',
    })
  }
  return out
}
