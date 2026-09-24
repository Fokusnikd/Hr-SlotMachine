/** Все звуки синтезируются WebAudio на лету — никаких ассетов. */
import type { Rarity } from '../game/types'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true
let lastTick = 0

function ac(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = 0.35
      master.connect(ctx.destination)
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, delay = 0, slideTo?: number) {
  const c = ac()
  if (!c || !master) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(dur: number, vol = 0.3, freq = 1800, delay = 0) {
  const c = ac()
  if (!c || !master) return
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
  g.gain.value = vol
  src.connect(f).connect(g).connect(master)
  src.start(c.currentTime + delay)
}

// ─── Музыка миниигры «Золотая папка» ────────────────────────────────────────────
// Процедурный луп (Am–F–C–G, 128 BPM): бочка, клэп, хэты, синкопированный бас и арпеджио.
// Планировщик с опережением: раз в 25 мс досылает ноты на ~120 мс вперёд по часам AudioContext.

const BPM = 128
const STEP = 60 / BPM / 4 // шестнадцатая
const LOOKAHEAD = 0.12
/** Аккорды по тактам (MIDI): Am, F, C, G. */
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
]
const ARP = [0, 1, 2, 3, 2, 1, 0, 2] // 3 — тоника октавой выше
const BASS_STEPS = new Set([0, 3, 6, 8, 10, 11, 14])
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

let musicGain: GainNode | null = null
let musicTimer: ReturnType<typeof setInterval> | undefined
let musicStep = 0
let musicNext = 0
let musicIntensity = 0
let noiseBuf: AudioBuffer | null = null

function noiseBuffer(c: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

function mVoice(c: AudioContext, out: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(out)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function mNoise(c: AudioContext, out: AudioNode, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c)
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(out)
  src.start(t)
  src.stop(t + dur + 0.02)
}

function scheduleStep(c: AudioContext, out: AudioNode, step: number, t: number) {
  const s = step % 16
  const bar = Math.floor(step / 16) % CHORDS.length
  const chord = CHORDS[bar]
  const hot = musicIntensity > 0
  // Бочка на каждую долю, клэп на 2 и 4.
  if (s % 4 === 0) mVoice(c, out, 150, t, 0.16, 'sine', 0.55, 42)
  if (s === 4 || s === 12) mNoise(c, out, t, 0.14, 0.28, 'bandpass', 1600)
  // Хэты: на слабые доли, в напряжённый момент — каждая шестнадцатая.
  if (s % 4 === 2) mNoise(c, out, t, 0.05, 0.16, 'highpass', 7000)
  else if (hot && s % 2 === 1) mNoise(c, out, t, 0.03, 0.08, 'highpass', 8000)
  // Бас: тоника двумя октавами ниже, октавный скачок на синкопах.
  if (BASS_STEPS.has(s)) mVoice(c, out, mtof(chord[0] - 24 + (s === 6 || s === 14 ? 12 : 0)), t, STEP * 1.6, 'sawtooth', 0.11)
  // Арпеджио восьмыми (в напряжении — шестнадцатыми и на октаву выше).
  if (hot || s % 2 === 0) {
    const i = ARP[(hot ? s : s / 2) % ARP.length]
    const note = i === 3 ? chord[0] + 12 : chord[i]
    mVoice(c, out, mtof(note + (hot ? 12 : 0)), t, STEP * 1.8, 'square', 0.045)
    mVoice(c, out, mtof(note + 12), t + 0.004, STEP * 1.2, 'triangle', 0.03)
  }
  // Пэд — в начале такта, тихий треугольник на весь аккорд.
  if (s === 0) chord.forEach((m) => mVoice(c, out, mtof(m), t, STEP * 15, 'triangle', 0.035))
}

function musicStop(fade = 0.6) {
  clearInterval(musicTimer)
  musicTimer = undefined
  const g = musicGain
  musicGain = null
  if (!g || !ctx) return
  const t = ctx.currentTime
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, fade))
  setTimeout(() => g.disconnect(), (fade + 0.3) * 1000)
}

export const music = {
  /** Запустить музыку бонуса (если уже играет — ничего). */
  start() {
    if (musicTimer) return
    const c = ac()
    if (!c || !master) return
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.6, c.currentTime + 0.8)
    g.connect(master)
    musicGain = g
    musicStep = 0
    musicIntensity = 0
    // Небольшая задержка — чтобы не наложиться на фанфары входа в бонус.
    musicNext = c.currentTime + 0.5
    const tick = () => {
      if (!ctx || !musicGain) return
      while (musicNext < ctx.currentTime + LOOKAHEAD) {
        scheduleStep(ctx, musicGain, musicStep, musicNext)
        musicNext += STEP
        musicStep++
      }
    }
    tick()
    musicTimer = setInterval(tick, 25)
  },
  /** Остановить с плавным затуханием. */
  stop(fade = 0.6) {
    musicStop(fade)
  },
  get playing() {
    return !!musicTimer
  },
  /** 0 — обычный луп, 1 — напряжение (до исхода остался один шаг). */
  setIntensity(level: number) {
    musicIntensity = level
  },
}

export const sfx = {
  setEnabled(v: boolean) {
    enabled = v
    if (!v) musicStop(0.05)
    if (!v && ctx) void ctx.suspend()
  },
  click() {
    tone(900, 0.05, 'square', 0.15)
  },
  lever() {
    noise(0.25, 0.4, 600)
    tone(180, 0.25, 'sawtooth', 0.12, 0, 90)
  },
  tick(reel: number) {
    const now = performance.now()
    if (now - lastTick < 28) return
    lastTick = now
    noise(0.03, 0.18, 2600 + reel * 200)
  },
  stop(reel: number) {
    noise(0.08, 0.5, 900)
    tone(220 + reel * 40, 0.12, 'triangle', 0.25)
  },
  nearMiss() {
    tone(392, 0.18, 'triangle', 0.3)
    tone(370, 0.35, 'triangle', 0.3, 0.18, 330)
  },
  win(rarity: Rarity) {
    const notes = rarity === 'legendary' ? [523, 659, 784, 1047, 1319, 1568] : rarity === 'rare' ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047]
    notes.forEach((f, i) => {
      tone(f, 0.28, 'square', 0.18, i * 0.09)
      tone(f * 2, 0.2, 'sine', 0.1, i * 0.09 + 0.02)
    })
  },
  /** Вспышка слота в «змейке»: нота растёт с номером слота. */
  ding(step: number) {
    const f = 660 * Math.pow(2, (step * 2) / 12)
    tone(f, 0.16, 'triangle', 0.16)
    tone(f * 2, 0.1, 'sine', 0.06, 0.01)
  },
  /** Переворот слота. */
  whoosh() {
    noise(0.18, 0.22, 1400)
  },
  coins(n = 8) {
    for (let i = 0; i < n; i++) tone(1800 + Math.random() * 900, 0.09, 'sine', 0.12, i * 0.05 + Math.random() * 0.03)
  },
}
