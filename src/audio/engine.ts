/**
 * Аудиодвижок: один AudioContext, сэмплы из public/audio (ogg или mp3), шины микшера и приглушение.
 * Контекст создаётся на первом жесте пользователя; до этого звуки тихо пропускаются, а файлы уже
 * скачиваются. Сначала грузится CRITICAL, остальное — в фоне.
 */
import { CRITICAL, SOUNDS, type Bus, type SoundId } from './manifest'
import * as volumes from './volumes'

/** Текущие настройки громкости из volumes.ts (в dev подменяются на лету при сохранении файла). */
let cfg: typeof volumes = volumes
export const vol = () => cfg

export type AudioFormat = 'ogg' | 'mp3'

/** ogg, если браузер его играет, иначе mp3. */
export function pickFormat(canPlayType: (type: string) => string): AudioFormat {
  try {
    return canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'
  } catch {
    return 'mp3'
  }
}

/** Путь к файлу с учётом base (GitHub Pages живёт не в корне). */
export function soundUrl(file: string, fmt: AudioFormat, base: string = import.meta.env.BASE_URL ?? '/'): string {
  return `${base.endsWith('/') ? base : base + '/'}audio/${file}.${fmt}`
}

/**
 * Границы лупа без тишины энкодера по краям (у mp3 ~25 мс в начале и хвост в конце).
 * Ищем первый/последний сэмпл громче порога, но не дальше `maxTrim` секунд от края.
 */
export function loopBounds(channels: Float32Array[], sampleRate: number, threshold = 0.001, maxTrim = 0.06): { start: number; end: number } {
  const len = channels[0]?.length ?? 0
  const limit = Math.min(Math.floor(maxTrim * sampleRate), Math.floor(len / 4))
  const loud = (i: number) => channels.some((c) => Math.abs(c[i]) > threshold)
  let a = 0
  while (a < limit && !loud(a)) a++
  let b = len - 1
  while (len - 1 - b < limit && b > a && !loud(b)) b--
  return { start: a / sampleRate, end: (b + 1) / sampleRate }
}

const BUSES: Bus[] = ['music', 'ambient', 'sfx', 'ui']
/** Громкость ползунка → усиление: квадратичная кривая звучит естественнее линейной. */
const volCurve = (v: number) => Math.max(0, Math.min(1, v)) ** 2
/** Расстройка мелких повторяющихся звуков, ±3 %. */
const JITTER = 0.03

let ctx: AudioContext | null = null
let master: GainNode | null = null
/** Вход шины (сюда подключаются звуки) → приглушение → громкость ползунка → master. */
const busDuck = {} as Record<Bus, GainNode>
const busVol = {} as Record<Bus, GainNode>
let fmt: AudioFormat = 'mp3'
let muted = false
let vols = { master: 1, music: 0.7, sfx: 0.8 }
const masterGain = () => (muted ? 0 : cfg.MASTER_VOLUME * volCurve(vols.master))
let started = false

const bytes = new Map<SoundId, Promise<ArrayBuffer | null>>()
const decoding = new Map<SoundId, Promise<AudioBuffer | null>>()
const buffers = new Map<SoundId, AudioBuffer>()
const loopPts = new Map<SoundId, { start: number; end: number }>()
const loops = new Set<Loop>()

function fetchBytes(id: SoundId): Promise<ArrayBuffer | null> {
  let p = bytes.get(id)
  if (!p) {
    p = fetch(soundUrl(SOUNDS[id].file, fmt))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null)
    bytes.set(id, p)
  }
  return p
}

function ensure(id: SoundId): Promise<AudioBuffer | null> {
  const have = decoding.get(id)
  if (have) return have
  const c = ctx
  if (!c) return Promise.resolve(null)
  const p = fetchBytes(id)
    .then((ab) => (ab ? c.decodeAudioData(ab) : null))
    .then((buf) => {
      if (buf) {
        buffers.set(id, buf)
        const def = SOUNDS[id] as { loop?: boolean }
        const ch = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
        loopPts.set(id, def.loop && fmt === 'mp3' ? loopBounds(ch, buf.sampleRate) : { start: 0, end: buf.duration })
      }
      return buf
    })
    .catch(() => null)
  decoding.set(id, p)
  return p
}

const others = () => (Object.keys(SOUNDS) as SoundId[]).filter((id) => !CRITICAL.includes(id))

async function loadAll(load: (id: SoundId) => Promise<unknown>) {
  await Promise.all(CRITICAL.map(load))
  // Остальное — по 4 файла параллельно, чтобы не забивать канал.
  const rest = others()
  for (let i = 0; i < rest.length; i += 4) await Promise.all(rest.slice(i, i + 4).map(load))
}

function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }
  try {
    ctx = new AudioContext()
  } catch {
    return
  }
  master = ctx.createGain()
  master.gain.value = masterGain()
  master.connect(ctx.destination)
  for (const b of BUSES) {
    busDuck[b] = ctx.createGain()
    busVol[b] = ctx.createGain()
    busDuck[b].connect(busVol[b]).connect(master)
  }
  applyVolumes(0)
  if (ctx.state === 'suspended') void ctx.resume()
  void loadAll(ensure)
  // Лупы, которые попросили до жеста (фон), стартуют, как только готов буфер.
  loops.forEach((l) => l.kick())
}

// ─── Приглушение (ducking) ───────────────────────────────────────────────────────

const ducks = new Map<string, { bus: Bus; level: number; until: number }>()
let duckSeq = 0

function applyDucks() {
  if (!ctx) return
  const now = performance.now()
  for (const [k, d] of ducks) if (d.until <= now) ducks.delete(k)
  const t = ctx.currentTime
  for (const b of BUSES) {
    let level = 1
    ducks.forEach((d) => d.bus === b && (level = Math.min(level, d.level)))
    const g = busDuck[b].gain
    if (Math.abs(g.value - level) < 0.001 && !ducks.size) continue
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(level, t + 0.3)
  }
}

function applyVolumes(ramp = 0.05) {
  if (!ctx || !master) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.linearRampToValueAtTime(masterGain(), t + ramp)
  const set = (b: Bus, v: number) => {
    const g = busVol[b].gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(volCurve(v), t + ramp)
  }
  set('music', vols.music)
  set('ambient', vols.music)
  set('sfx', vols.sfx)
  set('ui', vols.sfx)
}

// ─── Звуки ───────────────────────────────────────────────────────────────────────

export interface PlayOpts {
  /** Скорость воспроизведения (меняет и высоту). */
  rate?: number
  /** Сдвиг высоты в полутонах (через playbackRate). */
  semitones?: number
  /** Множитель к громкости из манифеста. */
  gain?: number
  /** Случайная расстройка ±3 %. */
  jitter?: boolean
  /** Задержка старта, с. */
  delay?: number
}

export interface Voice {
  /** Длительность с учётом скорости, с. */
  duration: number
  stop(fade?: number): void
}

function play(id: SoundId, o: PlayOpts = {}): Voice | null {
  if (!ctx || muted) return null
  const buf = buffers.get(id)
  if (!buf) {
    void ensure(id)
    return null
  }
  const c = ctx
  const src = c.createBufferSource()
  src.buffer = buf
  let rate = (o.rate ?? 1) * 2 ** ((o.semitones ?? 0) / 12)
  if (o.jitter) rate *= 1 + (Math.random() * 2 - 1) * JITTER
  src.playbackRate.value = rate
  const g = c.createGain()
  g.gain.value = cfg.VOLUME[id] * (o.gain ?? 1)
  src.connect(g).connect(busDuck[SOUNDS[id].bus])
  src.start(c.currentTime + (o.delay ?? 0))
  src.onended = () => g.disconnect()
  let stopped = false
  return {
    duration: buf.duration / rate,
    stop(fade = 0.05) {
      if (stopped) return
      stopped = true
      const t = c.currentTime
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(g.gain.value, t)
      g.gain.linearRampToValueAtTime(0, t + fade)
      try {
        src.stop(t + fade + 0.02)
      } catch {
        /* уже остановлен */
      }
    },
  }
}

/**
 * Луп с состоянием «хочу играть»: если буфер ещё не готов (или ещё не было жеста),
 * стартует, как только станет можно, — если к тому времени его не остановили.
 * Громкость и скорость меняются рампами; опционально — lowpass-фильтр.
 */
export class Loop {
  private src: AudioBufferSourceNode | null = null
  private out: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private active = false
  private rate = 1
  private level = 1
  private cutoff: number | null
  private fadeIn = 0.05
  private delay = 0

  constructor(
    readonly id: SoundId,
    opts: { lowpass?: number } = {},
  ) {
    this.cutoff = opts.lowpass ?? null
    loops.add(this)
  }

  get playing() {
    return this.active
  }

  start(o: { fadeIn?: number; rate?: number; level?: number; delay?: number } = {}) {
    if (this.active) return
    this.active = true
    this.fadeIn = o.fadeIn ?? 0.05
    this.rate = o.rate ?? 1
    this.level = o.level ?? 1
    this.delay = o.delay ?? 0
    this.kick()
  }

  /** Попробовать запустить (вызывается и после жеста/загрузки). */
  kick() {
    if (!this.active || this.src || !ctx) return
    const buf = buffers.get(this.id)
    if (!buf) {
      // Файл не скачался — не зацикливаемся, луп просто молчит.
      void ensure(this.id).then((b) => b && this.kick())
      return
    }
    const c = ctx
    const pts = loopPts.get(this.id) ?? { start: 0, end: buf.duration }
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.loopStart = pts.start
    src.loopEnd = pts.end
    src.playbackRate.value = this.rate
    const out = c.createGain()
    const t = c.currentTime + this.delay
    const target = cfg.VOLUME[this.id] * this.level
    out.gain.setValueAtTime(0, c.currentTime)
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(target, t + Math.max(0.01, this.fadeIn))
    let node: AudioNode = src
    if (this.cutoff != null) {
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = this.cutoff
      node.connect(f)
      node = f
      this.filter = f
    }
    node.connect(out).connect(busDuck[SOUNDS[this.id].bus])
    src.start(t, pts.start)
    this.src = src
    this.out = out
    this.delay = 0
  }

  private ramp(p: AudioParam, v: number, secs: number) {
    const t = ctx!.currentTime
    p.cancelScheduledValues(t)
    p.setValueAtTime(p.value, t)
    p.linearRampToValueAtTime(v, t + Math.max(0.01, secs))
  }

  setLevel(level: number, secs = 0.1) {
    this.level = level
    if (this.out && ctx) this.ramp(this.out.gain, cfg.VOLUME[this.id] * level, secs)
  }

  /** Перечитать громкость из volumes.ts. */
  refresh() {
    this.setLevel(this.level, 0.2)
  }

  setRate(rate: number, secs = 0.1) {
    this.rate = rate
    if (this.src && ctx) this.ramp(this.src.playbackRate, rate, secs)
  }

  setLowpass(freq: number, secs = 0.5) {
    this.cutoff = freq
    if (this.filter && ctx) {
      const p = this.filter.frequency
      const t = ctx.currentTime
      p.cancelScheduledValues(t)
      p.setValueAtTime(p.value, t)
      p.exponentialRampToValueAtTime(freq, t + secs)
    }
  }

  stop(fade = 0.2) {
    this.active = false
    const src = this.src
    const out = this.out
    this.src = this.out = this.filter = null
    if (!src || !out || !ctx) return
    const t = ctx.currentTime
    out.gain.cancelScheduledValues(t)
    out.gain.setValueAtTime(out.gain.value, t)
    out.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade))
    try {
      src.stop(t + fade + 0.03)
    } catch {
      /* уже остановлен */
    }
    src.onended = () => out.disconnect()
  }
}

export const audio = {
  /** Начать скачивание файлов и повесить разблокировку на первый жест. Идемпотентно. */
  init() {
    if (started || typeof window === 'undefined') return
    started = true
    fmt = pickFormat((t) => document.createElement('audio').canPlayType(t))
    void loadAll(fetchBytes)
    const onGesture = () => unlock()
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, onGesture, { capture: true, passive: true })
  },
  play,
  /**
   * Джингл: на время звучания фон и музыка приглушаются (DUCK в volumes.ts).
   * Возвращает голос (или null, если звук пропущен).
   */
  jingle(id: SoundId, o: PlayOpts & { musicDuck?: number } = {}): Voice | null {
    const v = play(id, o)
    if (v) {
      const key = `j${++duckSeq}`
      audio.duck(`${key}a`, 'ambient', cfg.DUCK.ambientUnderJingle, v.duration)
      audio.duck(`${key}m`, 'music', o.musicDuck ?? cfg.DUCK.musicUnderJingle, v.duration)
      // Оборвали раньше — приглушение снимается сразу.
      const stop = v.stop
      v.stop = (fade?: number) => {
        stop(fade)
        audio.unduck(`${key}a`)
        audio.unduck(`${key}m`)
      }
    }
    return v
  },
  /** Приглушить шину до `level` (на `seconds`, без него — до `unduck`). */
  duck(key: string, bus: Bus, level: number, seconds?: number) {
    ducks.set(key, { bus, level, until: seconds == null ? Infinity : performance.now() + seconds * 1000 })
    applyDucks()
    if (seconds != null) setTimeout(applyDucks, seconds * 1000 + 20)
  },
  unduck(key: string) {
    if (ducks.delete(key)) applyDucks()
  },
  setMuted(m: boolean) {
    muted = m
    applyVolumes(0.08)
  },
  /** Ползунки настроек, 0..1: общая, музыка (+фон), эффекты (+интерфейс). */
  setVolumes(v: { master: number; music: number; sfx: number }) {
    vols = { ...v }
    applyVolumes()
  },
  get muted() {
    return muted
  },
  /** Для процедурных звуков, которые ещё не переведены на сэмплы. */
  context(): AudioContext | null {
    return ctx
  },
  bus(b: Bus): AudioNode | null {
    return ctx ? busDuck[b] : null
  },
}

// Правка volumes.ts в dev применяется сразу, без перезагрузки и без потери AudioContext.
if (import.meta.hot) {
  import.meta.hot.accept('./volumes', (m) => {
    if (!m) return
    cfg = m as unknown as typeof volumes
    applyVolumes(0.1)
    loops.forEach((l) => l.refresh())
  })
}
