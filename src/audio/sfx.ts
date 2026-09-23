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

export const sfx = {
  setEnabled(v: boolean) {
    enabled = v
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
