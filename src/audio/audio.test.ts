import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loopBounds, pickFormat, soundUrl } from './engine'
import { CRITICAL, SOUNDS, WIN_SOUND } from './manifest'
import { winSoundFor } from './sfx'
import { majorStep, PAYLINES, rarityInPool } from '../game/outcome'
import { DEFAULT_MASTER_VOL, DEFAULT_MUSIC_VOL, DEFAULT_SFX_VOL, migrateSettings } from '../game/store'
import { VOLUME } from './volumes'

describe('выбор формата', () => {
  it('ogg, если браузер его играет', () => {
    expect(pickFormat((t) => (t.includes('ogg') ? 'probably' : ''))).toBe('ogg')
    expect(pickFormat((t) => (t.includes('ogg') ? 'maybe' : ''))).toBe('ogg')
  })
  it('mp3, если ogg не поддерживается или canPlayType падает', () => {
    expect(pickFormat(() => '')).toBe('mp3')
    expect(
      pickFormat(() => {
        throw new Error('nope')
      }),
    ).toBe('mp3')
  })
})

describe('пути к файлам', () => {
  it('учитывают base (GitHub Pages)', () => {
    expect(soundUrl('lever', 'ogg', '/')).toBe('/audio/lever.ogg')
    expect(soundUrl('lever', 'mp3', '/hrgacha/')).toBe('/hrgacha/audio/lever.mp3')
    expect(soundUrl('lever', 'mp3', '/hrgacha')).toBe('/hrgacha/audio/lever.mp3')
  })
  it('у каждого звука из манифеста есть ogg и mp3', () => {
    for (const def of Object.values(SOUNDS)) {
      for (const ext of ['ogg', 'mp3']) expect(existsSync(resolve(__dirname, `../../public/audio/${def.file}.${ext}`)), `${def.file}.${ext}`).toBe(true)
    }
    for (const id of CRITICAL) expect(SOUNDS[id]).toBeDefined()
  })
})

describe('звук выигрыша по уровню в пуле', () => {
  it('Match / Strong match / UNICORN', () => {
    expect(winSoundFor('common')).toBe('win-match')
    expect(winSoundFor('rare')).toBe('win-strong')
    expect(winSoundFor('legendary')).toBe('win-unicorn')
  })
  it('сквозь rarityInPool: потолок пула — UNICORN, на единицу ниже — Strong', () => {
    expect(WIN_SOUND[rarityInPool(6, 6)!]).toBe('win-unicorn')
    expect(WIN_SOUND[rarityInPool(5, 6)!]).toBe('win-strong')
    expect(WIN_SOUND[rarityInPool(3, 6)!]).toBe('win-match')
  })
})

describe('границы лупа (тишина энкодера mp3)', () => {
  it('срезает тихие края, но не больше лимита', () => {
    const sr = 1000
    const ch = new Float32Array(1000).fill(0.5)
    ch.fill(0, 0, 25) // 25 мс тишины в начале
    ch.fill(0, 990) // 10 мс в конце
    const b = loopBounds([ch], sr)
    expect(b.start).toBeCloseTo(0.025)
    expect(b.end).toBeCloseTo(0.99)
  })
  it('длинную тишину режет только до maxTrim', () => {
    const ch = new Float32Array(1000).fill(0.5)
    ch.fill(0, 0, 200)
    expect(loopBounds([ch], 1000, 0.001, 0.06).start).toBeCloseTo(0.06)
  })
  it('без тишины — весь буфер', () => {
    const ch = new Float32Array(500).fill(0.3)
    expect(loopBounds([ch], 1000)).toEqual({ start: 0, end: 0.5 })
  })
})

describe('миграция hrgacha:settings.v3', () => {
  it('старые настройки без громкостей получают значения по умолчанию', () => {
    const m = migrateSettings({ sound: true, lines: 5 })
    expect(m).toMatchObject({ sound: true, lines: 5, masterVol: DEFAULT_MASTER_VOL, musicVol: DEFAULT_MUSIC_VOL, sfxVol: DEFAULT_SFX_VOL })
  })
  it('sound: false остаётся общим mute, громкости сохраняются', () => {
    expect(migrateSettings({ sound: false, masterVol: 0.5, musicVol: 0.3, sfxVol: 0.9 })).toMatchObject({ sound: false, masterVol: 0.5, musicVol: 0.3, sfxVol: 0.9 })
    expect(migrateSettings({ sound: false })).toMatchObject({ sound: false, musicVol: DEFAULT_MUSIC_VOL })
  })
  it('битые значения чинятся и зажимаются в 0..1', () => {
    const m = migrateSettings({ musicVol: 'loud' as never, sfxVol: 7, sound: 'yes' as never })
    expect(m).toMatchObject({ musicVol: DEFAULT_MUSIC_VOL, sfxVol: 1, sound: true })
    expect(migrateSettings(null)).toMatchObject({ sound: true, musicVol: DEFAULT_MUSIC_VOL, sfxVol: DEFAULT_SFX_VOL })
  })
})

describe('volumes.ts', () => {
  it('громкость задана для каждого звука и в разумных пределах', () => {
    for (const id of Object.keys(SOUNDS)) {
      const v = VOLUME[id as keyof typeof VOLUME]
      expect(v, id).toBeGreaterThanOrEqual(0)
      expect(v, id).toBeLessThanOrEqual(2)
    }
  })
})

describe('ноты линий', () => {
  it('идут вверх по мажорной гамме: у каждой следующей линии нота выше', () => {
    expect(PAYLINES.slice(0, 8).map((l) => l.note)).toEqual([0, 2, 4, 5, 7, 9, 11, 12])
    for (let i = 1; i < PAYLINES.length; i++) expect(PAYLINES[i].note).toBeGreaterThan(PAYLINES[i - 1].note)
    expect(majorStep(24)).toBe(41)
  })
})
