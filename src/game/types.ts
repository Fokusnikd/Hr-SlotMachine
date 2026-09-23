export type SkillId = string

export interface Candidate {
  id: string
  name: string
  login?: string
  avatarUrl?: string
  title?: string
  location?: string
  company?: string
  bio?: string
  url: string
  /** Нормализованные навыки, отсортированы по «силе» (самые выраженные первыми). */
  skills: SkillId[]
  source: CandidateSource
  stats?: { repos?: number; followers?: number }
  /** Примерный опыт в годах (по датам в резюме). */
  years?: number
  /** Доп. ссылки: LinkedIn, сайт, GitHub. */
  links?: { label: string; url: string }[]
}

export type CandidateSource = 'jsonresume' | 'github' | 'mock'

export type Rarity = 'common' | 'rare' | 'legendary'

export interface SpinResult {
  /** Видимые символы: grid[ряд][барабан], ряд 0 — верхний. */
  grid: SkillId[][]
  /** Средний ряд (основная линия). */
  line: SkillId[]
  /** Клетки, которые участвуют в оценке (объединение всех линий). */
  cells: { reel: number; row: number }[]
  /** Активные линии этого спина. */
  lines: { id: number; color: string; rows: number[] }[]
  /** Все выигрыши спина (разные люди на непересекающихся клетках), лучший первым. */
  wins: {
    candidate: Candidate
    matched: SkillId[]
    lineIds: number[]
    cells: { reel: number; row: number }[]
    rarity: Rarity
  }[]
  /** Клетки и линии всех выигрышей (объединение). */
  winCells: { reel: number; row: number }[]
  winLines: number[]
  winner: Candidate | null
  /** Лучший победитель и объединение совпавших навыков всех выигрышей. */
  matched: SkillId[]
  rarity: Rarity | null
  /** Клетки с бонусным символом «Золотая папка». */
  scatters: { reel: number; row: number }[]
  /** Число папок, если их 3+ (запуск миниигры), иначе 0. */
  bonus: number
  /** Результат собран из приза миниигры, а не из линий. */
  fromBonus?: boolean
  /** Лучший «почти» кандидат, если совпало 2 навыка. */
  nearMiss: { candidate: Candidate; matched: SkillId[] } | null
}
