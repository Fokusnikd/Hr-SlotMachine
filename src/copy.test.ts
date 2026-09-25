import { describe, expect, it } from 'vitest'
import { MSG, pick, pickStable, say } from './copy'
import { rarityInPool } from './game/outcome'
import { poolMaxFor, withPoolRarity } from './game/store'
import type { Candidate, SpinResult } from './game/types'

describe('copy: наборы фраз', () => {
  it('pick не повторяет один и тот же вариант два раза подряд', () => {
    const list = ['a', 'b', 'c']
    let prev = pick(list)
    for (let i = 0; i < 500; i++) {
      const next = pick(list)
      expect(next).not.toBe(prev)
      prev = next
    }
  })

  it('pick из набора в один элемент всегда возвращает его', () => {
    expect(pick(['only'])).toBe('only')
  })

  it('pickStable стабилен для одного ключа', () => {
    const list = ['a', 'b', 'c', 'd']
    const first = pickStable(list, 'lost|lose|3.4')
    for (let i = 0; i < 20; i++) expect(pickStable(list, 'lost|lose|3.4')).toBe(first)
  })

  it('say подставляет параметры во все варианты', () => {
    for (let i = 0; i < 30; i++) expect(say(MSG.nearMiss, 'Jane Doe')).toContain('Jane Doe')
    for (let i = 0; i < 30; i++) expect(say(MSG.refill, 1000)).toContain('1000')
  })
})

describe('уровни относительно максимума пула', () => {
  it('UNICORN — только максимум пула, Strong match — максимум − 1', () => {
    expect(rarityInPool(7, 7)).toBe('legendary')
    expect(rarityInPool(6, 7)).toBe('rare')
    expect(rarityInPool(5, 7)).toBe('common')
    expect(rarityInPool(3, 7)).toBe('common')
    expect(rarityInPool(2, 7)).toBeNull()
    // Выбрано 8 навыков, но в пуле максимум 4 — юникорны с 4.
    expect(rarityInPool(4, 4)).toBe('legendary')
    expect(rarityInPool(3, 4)).toBe('rare')
  })

  it('poolMaxFor считает максимум пересечения с выбранными навыками', () => {
    const c = (id: string, skills: string[]) => ({ id, name: id, skills, source: 'mock', url: '' }) as unknown as Candidate
    const pool = [c('a', ['react', 'node']), c('b', ['react', 'node', 'sql', 'go']), c('c', ['css'])]
    expect(poolMaxFor(pool, ['react', 'node', 'sql', 'docker'] as never)).toBe(3)
  })

  it('withPoolRarity пересчитывает уровни выигрышей и итоговый уровень спина', () => {
    const w = (n: number) => ({ candidate: { id: String(n) } as Candidate, matched: Array.from({ length: n }, (_, i) => `s${i}`), lineIds: [1], cells: [], rarity: 'common' as const })
    const r = { wins: [w(4), w(3)], rarity: 'common' } as unknown as SpinResult
    const out = withPoolRarity(r, 4)
    expect(out.wins.map((x) => x.rarity)).toEqual(['legendary', 'rare'])
    expect(out.rarity).toBe('legendary')
  })
})
