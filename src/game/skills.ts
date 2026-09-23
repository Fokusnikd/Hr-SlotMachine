import type { SkillId } from './types'

export interface SkillDef {
  id: SkillId
  label: string
  color: string
  /** Варианты написания: языки GitHub, topics, слова из bio (в нижнем регистре). */
  aliases: string[]
}

const def = (id: string, label: string, color: string, aliases: string[] = []): SkillDef => ({
  id,
  label,
  color,
  aliases: [id, label.toLowerCase(), ...aliases],
})

export const SKILLS: SkillDef[] = [
  def('typescript', 'TypeScript', '#3178c6', ['ts']),
  def('javascript', 'JavaScript', '#e8c547', ['js', 'es6', 'ecmascript', 'jquery', 'webpack', 'vite']),
  def('python', 'Python', '#3a76a8', ['py', 'jupyter notebook', 'django', 'fastapi', 'flask']),
  def('go', 'Go', '#00add8', ['golang']),
  def('rust', 'Rust', '#ce6a3a', ['rustlang']),
  def('java', 'Java', '#b07219', ['spring', 'spring-boot', 'maven', 'gradle', 'hibernate']),
  def('kotlin', 'Kotlin', '#a97bff', ['android']),
  def('swift', 'Swift', '#f05138', ['ios', 'swiftui']),
  def('csharp', 'C#', '#6a40c2', ['c#', '.net', 'dotnet', 'asp.net']),
  def('cpp', 'C++', '#f34b7d', ['c++']),
  def('c', 'C', '#7a8a99'),
  def('php', 'PHP', '#6f7fbf', ['laravel', 'symfony', 'wordpress']),
  def('ruby', 'Ruby', '#cc342d', ['rails', 'ruby-on-rails']),
  def('scala', 'Scala', '#dc322f'),
  def('elixir', 'Elixir', '#8a5fa8', ['phoenix']),
  def('dart', 'Dart', '#00b4ab', ['flutter']),
  def('react', 'React', '#61dafb', ['reactjs', 'react.js', 'nextjs', 'next.js', 'react-native', 'redux', 'react native']),
  def('vue', 'Vue', '#42b883', ['vuejs', 'vue.js', 'nuxt', 'nuxtjs']),
  def('angular', 'Angular', '#dd0031', ['angularjs']),
  def('svelte', 'Svelte', '#ff3e00', ['sveltekit']),
  def('node', 'Node.js', '#5fa04e', ['nodejs', 'node.js', 'express', 'nestjs', 'deno', 'bun']),
  def('css', 'CSS', '#663399', ['scss', 'sass', 'tailwind', 'tailwindcss', 'less', 'css3', 'bootstrap']),
  def('html', 'HTML', '#e34c26', ['html5']),
  def('graphql', 'GraphQL', '#e10098', ['apollo']),
  def('threejs', 'Three.js', '#9aa7b8', ['three', 'webgl', 'three-js', 'r3f', 'glsl']),
  def('sql', 'SQL', '#e38c00', ['plpgsql', 'tsql', 't-sql', 'mysql', 'sqlite', 'sql server', 'mssql', 'oracle', 'mariadb']),
  def('postgres', 'PostgreSQL', '#4169e1', ['postgresql', 'postgis', 'postgres', 'supabase']),
  def('mongodb', 'MongoDB', '#47a248', ['mongo', 'mongoose']),
  def('redis', 'Redis', '#dc382d'),
  def('kafka', 'Kafka', '#8a8a8a', ['apache-kafka', 'rabbitmq']),
  def('docker', 'Docker', '#2496ed', ['dockerfile', 'containers', 'docker-compose']),
  def('kubernetes', 'Kubernetes', '#326ce5', ['k8s', 'helm', 'openshift']),
  def('aws', 'AWS', '#ff9900', ['amazon-web-services', 'lambda', 'serverless', 's3', 'rds', 'dynamodb', 'ec2', 'aws lambda']),
  def('azure', 'Azure', '#0078d4', ['microsoft azure', 'azure devops', 'azure-devops']),
  def('gcp', 'GCP', '#4285f4', ['google-cloud', 'google-cloud-platform', 'firebase', 'bigquery']),
  def('terraform', 'Terraform', '#7b42bc', ['hcl', 'iac', 'ansible']),
  def('linux', 'Linux', '#fcc624', ['shell', 'bash', 'zsh', 'nix', 'nginx', 'ubuntu']),
  def('monitoring', 'Monitoring', '#f46800', ['observability', 'grafana', 'prometheus', 'elasticsearch', 'elk', 'kibana', 'datadog', 'sentry', 'opentelemetry']),
  def('ci', 'CI/CD', '#2088ff', ['github-actions', 'gitlab-ci', 'jenkins', 'devops', 'gitlab', 'ci', 'circleci']),
  def('ml', 'ML', '#ff6f00', ['machine-learning', 'deep-learning', 'pytorch', 'tensorflow', 'scikit-learn', 'ai', 'llm', 'llms', 'prompt engineering', 'openai', 'langchain', 'nlp', 'computer vision']),
  def('data', 'Data', '#150458', ['pandas', 'data-science', 'numpy', 'spark', 'airflow', 'etl', 'r', 'power bi', 'tableau', 'data analysis', 'dbt']),
  def('unity', 'Unity', '#9a9a9a', ['unity3d', 'gamedev', 'game-development', 'godot', 'gdscript']),
  def('figma', 'Figma', '#f24e1e', ['ux', 'ui', 'design', 'ui-design']),
  def('testing', 'Testing', '#99425b', ['jest', 'vitest', 'cypress', 'playwright', 'tdd', 'pytest', 'junit', 'selenium', 'unit testing', 'postman']),
  def('security', 'Security', '#c0392b', ['infosec', 'pentest', 'ctf', 'cybersecurity']),
  def('blockchain', 'Web3', '#3c3c3d', ['solidity', 'ethereum', 'web3', 'smart-contracts']),
  def('lua', 'Lua', '#000080', ['neovim']),
  def('haskell', 'Haskell', '#5e5086', ['ocaml', 'f#', 'clojure', 'elm']),
]

const byId = new Map(SKILLS.map((s) => [s.id, s]))
const byAlias = new Map<string, SkillId>()
for (const s of SKILLS) for (const a of s.aliases) if (!byAlias.has(a)) byAlias.set(a, s.id)

export function getSkill(id: SkillId): SkillDef {
  return byId.get(id) ?? { id, label: id, color: '#888888', aliases: [id] }
}

/** Приводит язык/топик/слово к каноническому навыку, либо null. */
export function normalizeSkill(raw: string | null | undefined): SkillId | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (!s) return null
  return (
    byAlias.get(s) ??
    byAlias.get(s.replace(/\s+/g, '-')) ?? // "GitHub Actions" → github-actions
    byAlias.get(s.replace(/[\s.]+/g, '')) ?? // "Next.js" / "Vue JS" → nextjs / vuejs
    byAlias.get(s.replace(/\s*(js|\.js)$/, '')) ?? // "Express JS" → express
    null
  )
}

/**
 * Резюме пишут навыки как угодно: "HTML/CSS", "React (Hooks, Redux)", "AWS & GCP".
 * Разбиваем на отдельные токены и нормализуем каждый.
 */
export function splitKeyword(raw: string): string[] {
  const out: string[] = []
  const m = raw.match(/^([^(]*)\(([^)]*)\)/)
  const parts = m ? [m[1], ...m[2].split(/[,;]/)] : raw.split(/[,;]/)
  for (const p of parts) for (const q of p.split(/\s*(?:\/|&|\band\b|\|)\s*/)) if (q.trim()) out.push(q.trim())
  return out
}

export function normalizeKeyword(raw: string): SkillId[] {
  const whole = normalizeSkill(raw)
  if (whole) return [whole]
  const found = new Set<SkillId>()
  for (const part of splitKeyword(raw)) {
    const id = normalizeSkill(part)
    if (id) found.add(id)
  }
  return [...found]
}

/** Слова, которые в свободном тексте слишком часто значат что-то другое («design», «data», «spring»). */
const TEXT_STOPWORDS = new Set([
  'design', 'ui', 'ux', 'ai', 'data', 'containers', 'shell', 'three', 'spring', 'lambda', 'serverless', 'less',
  'nix', 'elm', 'phoenix', 'bun', 'deno', 'apollo', 'helm', 'iac', 'etl', 'testing', 'security', 'devops', 'r', 'c', 'go',
])

/** Ищет навыки в свободном тексте (bio). Короткие алиасы (≤2 символа) пропускаем — слишком много ложных срабатываний. */
export function extractSkillsFromText(text: string | null | undefined): SkillId[] {
  if (!text) return []
  const tokens = text.toLowerCase().split(/[^a-z0-9#+.\-]+/i).filter(Boolean)
  const found = new Set<SkillId>()
  for (const t of tokens) {
    const clean = t.replace(/^[.\-]+|[.\-]+$/g, '')
    if ((clean.length <= 2 && clean !== 'c#') || TEXT_STOPWORDS.has(clean)) continue
    const id = byAlias.get(clean)
    if (id) found.add(id)
  }
  return [...found]
}
