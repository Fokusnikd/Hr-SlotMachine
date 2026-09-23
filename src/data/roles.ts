import type { SkillId } from '../game/types'

interface Role {
  title: string
  core: SkillId[]
  extra: SkillId[]
}

export const ROLES: Role[] = [
  { title: 'Frontend-разработчик', core: ['react', 'typescript', 'css'], extra: ['javascript', 'html', 'testing', 'graphql', 'figma', 'node', 'vue', 'threejs', 'ci'] },
  { title: 'Vue-разработчик', core: ['vue', 'javascript', 'css'], extra: ['typescript', 'html', 'node', 'testing', 'figma', 'php'] },
  { title: 'Fullstack-разработчик', core: ['typescript', 'node', 'react'], extra: ['postgres', 'docker', 'graphql', 'redis', 'aws', 'mongodb', 'testing', 'ci'] },
  { title: 'Go-бэкенд', core: ['go', 'postgres', 'docker'], extra: ['kubernetes', 'kafka', 'redis', 'linux', 'ci', 'sql', 'aws'] },
  { title: 'Java-бэкенд', core: ['java', 'sql', 'kafka'], extra: ['kotlin', 'postgres', 'docker', 'kubernetes', 'redis', 'testing', 'aws'] },
  { title: 'Python-бэкенд', core: ['python', 'postgres', 'docker'], extra: ['redis', 'sql', 'linux', 'aws', 'testing', 'kafka', 'ci'] },
  { title: 'ML-инженер', core: ['python', 'ml', 'data'], extra: ['sql', 'docker', 'gcp', 'aws', 'cpp', 'linux'] },
  { title: 'Data-инженер', core: ['python', 'sql', 'data'], extra: ['kafka', 'postgres', 'aws', 'docker', 'scala', 'terraform'] },
  { title: 'DevOps / SRE', core: ['kubernetes', 'docker', 'terraform'], extra: ['linux', 'aws', 'gcp', 'ci', 'go', 'python', 'security'] },
  { title: 'iOS-разработчик', core: ['swift', 'testing', 'ci'], extra: ['figma', 'graphql', 'kotlin', 'gcp'] },
  { title: 'Android-разработчик', core: ['kotlin', 'java', 'testing'], extra: ['gcp', 'ci', 'figma', 'graphql'] },
  { title: 'Flutter-разработчик', core: ['dart', 'gcp', 'figma'], extra: ['testing', 'kotlin', 'swift', 'ci'] },
  { title: 'Геймдев', core: ['unity', 'csharp', 'cpp'], extra: ['threejs', 'lua', 'figma', 'python'] },
  { title: 'Rust-разработчик', core: ['rust', 'linux', 'cpp'], extra: ['go', 'docker', 'security', 'blockchain', 'c'] },
  { title: 'PHP-разработчик', core: ['php', 'sql', 'javascript'], extra: ['docker', 'redis', 'vue', 'css', 'linux'] },
  { title: '.NET-разработчик', core: ['csharp', 'sql', 'docker'], extra: ['angular', 'typescript', 'kafka', 'aws', 'testing'] },
]

/** Угадываем «должность» по набору навыков GitHub-профиля. */
export function guessTitle(skills: SkillId[]): string {
  const set = new Set(skills)
  let best: { title: string; score: number } = { title: 'Разработчик', score: 0 }
  for (const r of ROLES) {
    const score =
      r.core.reduce((acc, s, i) => acc + (set.has(s) ? 3 - i * 0.5 : 0), 0) +
      r.extra.reduce((acc, s) => acc + (set.has(s) ? 0.5 : 0), 0) +
      (skills[0] === r.core[0] ? 1.5 : 0)
    if (score > best.score) best = { title: r.title, score }
  }
  return best.score >= 3 ? best.title : 'Разработчик'
}
