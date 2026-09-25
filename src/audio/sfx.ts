/**
 * Звуки игры. Сэмплы (CC0, см. CREDITS.md) играются через движок `engine.ts`; здесь — события игры.
 * Громкость всего — в volumes.ts.
 */
import type { Rarity } from '../game/types'
import { audio, Loop, vol, type Voice } from './engine'
import { REEL_LOOP_RATE, WIN_SOUND } from './manifest'

/** Звук выигрыша по уровню в пуле. */
export const winSoundFor = (r: Rarity) => WIN_SOUND[r]

const ambient = new Loop('ambient')
const reelLoop = new Loop('reel-loop')
/** Фанфары бонуса: от 3-й папки на барабанах до открытия окна миниигры. */
let fanfare: Voice | null = null

// ─── Тик стрелки колеса (процедурный: короткий щелчок шума, звучит как нужно) ─────

let lastTick = 0

function noise(dur: number, level: number, freq: number) {
  const c = audio.context()
  const out = audio.bus('sfx')
  if (!c || !out || audio.muted) return
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = c.createGain()
  g.gain.value = level * vol().WHEEL_TICK_VOLUME
  src.connect(f).connect(g).connect(out)
  src.start(c.currentTime)
}

// ─── Музыка миниигр ─────────────────────────────────────────────────────────────

const bonusMusic = new Loop('bonus-music', { lowpass: vol().BONUS_MUSIC.lowpass })
const wheelMusic = new Loop('wheel-music', { lowpass: vol().WHEEL_MUSIC.lowpass })
let wheelMusicTimer: ReturnType<typeof setTimeout> | undefined

/** Музыка «Золотой папки». API прежний: start / stop / setIntensity / playing. */
export const music = {
  /** Запустить (если уже играет — ничего). Вступает через 0,5 с после открытия окна. */
  start() {
    if (bonusMusic.playing) return
    const m = vol().BONUS_MUSIC
    bonusMusic.start({ delay: 0.5, fadeIn: 0.8 })
    bonusMusic.setLowpass(m.lowpass, 0.01)
  },
  /** Остановить с плавным затуханием. */
  stop(fade = 0.6) {
    bonusMusic.stop(fade)
  },
  get playing() {
    return bonusMusic.playing
  },
  /** 0 — обычный луп, 1 — напряжение (до исхода остался один шаг): фильтр открывается, громче, быстрее. */
  setIntensity(level: number) {
    const m = vol().BONUS_MUSIC
    const hot = level > 0
    bonusMusic.setLowpass(hot ? 20000 : m.lowpass, 0.5)
    bonusMusic.setLevel(hot ? m.hotLevel : 1, 0.5)
    bonusMusic.setRate(hot ? m.hotRate : 1, 0.5)
  },
}

/** Напряжение музыки колеса по ступени цепочки: фильтр приоткрывается, темп растёт. */
function wheelTension(step: number) {
  const m = vol().WHEEL_MUSIC
  const k = Math.min(1, step / m.fullOpenAtStep)
  wheelMusic.setLowpass(m.lowpass * Math.pow(20000 / m.lowpass, k), 0.5)
  wheelMusic.setRate(Math.min(m.maxRate, 1 + m.ratePerStep * step), 0.5)
}

function startWheelMusic() {
  clearTimeout(wheelMusicTimer)
  if (wheelMusic.playing) return
  wheelMusic.start({ fadeIn: 1 })
  wheelTension(0)
}

export const sfx = {
  /** Скачать звуки, включить фон (зазвучит после первого жеста). */
  init() {
    audio.init()
    ambient.start({ fadeIn: 2 })
  },
  /** Общий mute и громкость ползунков (0..1). */
  configure(o: { muted: boolean; master: number; music: number; sfx: number }) {
    audio.setMuted(o.muted)
    audio.setVolumes({ master: o.master, music: o.music, sfx: o.sfx })
  },
  /** Приглушить фон на время миниигры (бонус, колесо). */
  miniGame(on: boolean) {
    if (on) audio.duck('minigame', 'ambient', vol().DUCK.ambientInMiniGame)
    else audio.unduck('minigame')
  },

  // Основная игра
  lever() {
    audio.play('lever')
  },
  /** Кнопки автомата: ±линии, пресеты, автоспин. */
  button() {
    audio.play('button', { jitter: true })
  },
  /** Интерфейс: клавиши вывески, модалки, ссылки. */
  uiClick() {
    audio.play('ui-click', { jitter: true })
  },
  spinStart() {
    fanfare = null
    reelLoop.stop(0.03)
    reelLoop.start({ rate: REEL_LOOP_RATE, fadeIn: 0.08 })
  },
  /** Сколько барабанов ещё крутится: громкость лупа падает ступенькой, на нуле — стоп. */
  reelsLeft(left: number, total: number) {
    if (left <= 0) reelLoop.stop(0.12)
    else reelLoop.setLevel(left / total, 0.06)
  },
  reelStop() {
    audio.play('reel-stop', { jitter: true })
  },
  /** Линия стала последней включённой — звучит её нота (`Payline.note`). */
  lineNote(note: number) {
    audio.play('line-note', { semitones: note + vol().LINE_NOTE_SHIFT })
  },
  /** Упор: линий уже максимум (жмут +) или минимум (жмут −). */
  lineLimit() {
    audio.play('line-limit')
  },
  /** Золотая папка: `n`-я за спин звучит на 2·(n−1) полутона выше. */
  scatter(n: number) {
    audio.play('scatter', { semitones: 2 * Math.max(0, n - 1) })
  },
  /** Все барабаны встали, выпал бонус — фанфары (чуть позже, чтобы дозвучала последняя папка);
   *  звучат до открытия окна миниигры. */
  bonusFanfare() {
    fanfare?.stop(0.05)
    fanfare = audio.jingle('bonus-enter', { delay: vol().BONUS_FANFARE_DELAY })
  },
  /** Окно миниигры открылось — фанфары затухают, дальше музыка бонуса. */
  bonusOpened() {
    fanfare?.stop(vol().BONUS_FANFARE_FADE)
    fanfare = null
  },
  win(rarity: Rarity) {
    audio.jingle(winSoundFor(rarity))
  },
  /** Открылось колесо торга — сразу музыка колеса. */
  wheelOpen() {
    wheelMusic.stop(0.05)
    startWheelMusic()
  },
  /** Победа на колесе (и зелёный сектор, и потолок): джингл, музыка на ступень напряжённее. */
  wheelWin(step: number) {
    audio.jingle('wheel-win')
    wheelTension(step)
  },
  /** Папка в миниигре «Золотая папка» открылась: у каждого исхода свой звук. */
  folder(face: 'hire' | 'reject' | 'empty' | 'shield') {
    const id = face === 'hire' ? 'folder-match' : face === 'reject' ? 'folder-miss' : face === 'shield' ? 'folder-shield' : 'folder-noshow'
    audio.play(id, { jitter: true })
  },
  /** Миниигра «Золотая папка» проиграна (набралось 3 «Мимо»): грустная труба, как на колесе. */
  bonusLose() {
    audio.jingle('almost')
  },
  /** Открылось окно «Out of budget» — глухой сигнал, чтобы его заметили. */
  broke() {
    audio.play('line-limit')
    audio.jingle('almost', { delay: 0.12 })
  },
  /** Потолок колеса — финальная победа: фанфары. */
  wheelFinal(step: number) {
    audio.jingle('win-unicorn')
    wheelTension(step)
  },
  /** Неактивная кнопка: тот же глухой звук, что и упор линий. */
  disabled() {
    audio.play('line-limit')
  },
  /** Проигрыш на колесе торга: музыка обрывается, грустная труба. */
  wheelLose() {
    clearTimeout(wheelMusicTimer)
    wheelMusic.stop(0.05)
    audio.jingle('almost')
  },
  /** Вышли из колеса (забрали, отказались, проиграли) — всё затихает. */
  wheelEnd() {
    clearTimeout(wheelMusicTimer)
    wheelMusic.stop(0.6)
  },
  credits() {
    audio.play('credits')
  },
  cash() {
    audio.play('cash')
  },
  shortlist() {
    audio.play('shortlist')
  },

  /** Щелчок стрелки колеса на границе сектора (не чаще раза в 28 мс). */
  tick(sector: number) {
    const now = performance.now()
    if (now - lastTick < 28) return
    lastTick = now
    noise(0.03, 0.18, 2600 + sector * 200)
  },
  /** Жёлтый сектор — респин. */
  wheelRespin() {
    audio.play('wheel-respin')
  },
  /** Плашка выигранного навыка долетела до табло: каждая следующая — на 2 полутона выше. */
  chipLanded(i: number) {
    audio.play('scatter', { semitones: 2 * i, gain: 0.7 })
  },
}
