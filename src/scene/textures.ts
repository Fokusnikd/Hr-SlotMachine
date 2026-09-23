import * as THREE from 'three'
import { getSkill } from '../game/skills'
import type { SkillId } from '../game/types'
import { SCATTER } from '../game/outcome'

const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif'
const cache = new Map<string, THREE.CanvasTexture>()

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)))
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`
}

function finish(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Плитка навыка для барабана. */
export function skillTexture(id: SkillId): THREE.CanvasTexture {
  if (id === SCATTER) return scatterTexture()
  const hit = cache.get(id)
  if (hit) return hit
  const skill = getSkill(id)
  const W = 512
  const H = 300
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Поля вокруг плашки прозрачные: «бумага» — это фон ленты, а не часть плитки.
  // Иначе при увеличении/повороте слота вокруг него проступает светлый прямоугольник.

  // Плашка навыка
  const pad = 26
  const grad = ctx.createLinearGradient(0, pad, 0, H - pad)
  grad.addColorStop(0, shade(skill.color, 0.12))
  grad.addColorStop(1, shade(skill.color, -0.12))
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 44)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.stroke()

  // Блик
  roundRect(ctx, pad + 14, pad + 12, W - pad * 2 - 28, (H - pad * 2) * 0.38, 34)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fill()

  // Текст
  const dark = luminance(skill.color) > 0.45
  const label = skill.label
  let size = 118
  ctx.font = `800 ${size}px ${FONT}`
  while (ctx.measureText(label).width > W - pad * 2 - 60 && size > 40) {
    size -= 4
    ctx.font = `800 ${size}px ${FONT}`
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'
  ctx.fillText(label, W / 2 + 3, H / 2 + 7)
  ctx.fillStyle = dark ? '#16121f' : '#ffffff'
  ctx.fillText(label, W / 2, H / 2 + 4)

  const tex = finish(canvas)
  cache.set(id, tex)
  return tex
}

/** Неоновая вывеска над машиной. */
export function signTexture(): THREE.CanvasTexture {
  const hit = cache.get('__sign')
  if (hit) return hit
  const W = 1024
  const H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#2a0d3d')
  g.addColorStop(1, '#12051c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 132px ${FONT}`
  ctx.shadowColor = '#ff3fd8'
  ctx.shadowBlur = 40
  ctx.fillStyle = '#ffd6f7'
  ctx.fillText('HR GACHA', W / 2, H / 2 - 18)
  ctx.shadowBlur = 16
  ctx.fillText('HR GACHA', W / 2, H / 2 - 18)

  ctx.shadowColor = '#3ff6ff'
  ctx.shadowBlur = 18
  ctx.font = `700 38px ${FONT}`
  ctx.fillStyle = '#c9fbff'
  ctx.fillText('T A L E N T   S L O T   M A C H I N E', W / 2, H - 42)

  const tex = finish(canvas)
  cache.set('__sign', tex)
  return tex
}

/** Надпись на нижней панели. */
export function panelTexture(): THREE.CanvasTexture {
  const hit = cache.get('__panel')
  if (hit) return hit
  const W = 1024
  const H = 160
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1b0f2b'
  ctx.fillRect(0, 0, W, H)
  ctx.font = `700 44px ${FONT}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffcf4a'
  ctx.fillText('3+ skills in combo = candidate', 40, 52)
  ctx.fillStyle = '#9fe8ff'
  ctx.font = `600 34px ${FONT}`
  ctx.fillText('crossing lines stack', 40, 112)
  const tex = finish(canvas)
  cache.set('__panel', tex)
  return tex
}

/** Табло линий и ставки на корпусе. Одна канва, перерисовывается при смене значений. */
export function makeLinesDisplay(W = 552, H = 120) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const tex = finish(canvas)
  const draw = (lines: number, cost: number, auto: boolean) => {
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#05020b'
    roundRect(ctx, 3, 3, W - 6, H - 6, 16)
    ctx.fill()
    ctx.strokeStyle = '#e7b64a'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(W / 2, 16)
    ctx.lineTo(W / 2, H - 16)
    ctx.strokeStyle = 'rgba(231,182,74,0.4)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cell = (cx: number, label: string, value: string, color: string) => {
      ctx.fillStyle = '#9fe8ff'
      ctx.font = `700 ${Math.round(H * 0.2)}px ${FONT}`
      ctx.fillText(label, cx, H * 0.27)
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 10
      ctx.font = `900 ${Math.round(H * 0.44)}px ${FONT}`
      ctx.fillText(value, cx, H * 0.66)
      ctx.shadowBlur = 0
    }
    cell(W / 4, auto ? 'LINES · AUTO' : 'LINES', String(lines), auto ? '#5cff9a' : '#ffd6f7')
    cell((W * 3) / 4, 'BET', `${cost} ◎`, '#ffd84a')
    tex.needsUpdate = true
  }
  return { tex, draw }
}

/** Табличка с номером линии по краю окна (как в автоматах). */
export function lineTagTexture(id: number, color: string): THREE.CanvasTexture {
  const key = `__tag${id}`
  const hit = cache.get(key)
  if (hit) return hit
  const W = 96
  const H = 64
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  roundRect(ctx, 2, 2, W - 4, H - 4, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 44px ${FONT}`
  ctx.fillStyle = luminance(color) > 0.35 ? '#12081c' : '#ffffff'
  ctx.fillText(String(id), W / 2, H / 2 + 2)
  const tex = finish(canvas)
  cache.set(key, tex)
  return tex
}

/** Надпись на клавише панели (прозрачный фон, тёмный текст). */
export function keyLabelTexture(title: string, sub = ''): THREE.CanvasTexture {
  const key = `__key${title}|${sub}`
  const hit = cache.get(key)
  if (hit) return hit
  const W = 256
  const H = 160
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1b0f2b'
  const big = title.length <= 2
  /** Шрифт уменьшается, пока строка не влезет в клавишу. */
  const fit = (text: string, weight: number, size: number) => {
    let px = size
    ctx.font = `${weight} ${px}px ${FONT}`
    while (ctx.measureText(text).width > W - 20 && px > 14) {
      px -= 2
      ctx.font = `${weight} ${px}px ${FONT}`
    }
  }
  fit(title, 900, big ? 86 : 48)
  ctx.fillText(title, W / 2, sub ? (big ? 64 : 58) : H / 2 + 4)
  if (sub) {
    fit(sub, 800, big ? 36 : 40)
    ctx.fillText(sub, W / 2, big ? 124 : 112)
  }
  const tex = finish(canvas)
  cache.set(key, tex)
  return tex
}

/** Табло сообщений на корпусе: до двух строк, перерисовывается при смене текста. */
export function makeMessageDisplay(W = 1024, H = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const tex = finish(canvas)
  const draw = (text: string, tone: 'idle' | 'spinning' | 'win' | 'bonus') => {
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#05020b'
    roundRect(ctx, 3, 3, W - 6, H - 6, 16)
    ctx.fill()
    ctx.strokeStyle = '#e7b64a'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const color = tone === 'win' || tone === 'bonus' ? '#ffd84a' : tone === 'spinning' ? '#9fe8ff' : '#fff2c4'
    // Подбираем размер: одна строка, если влезает, иначе две.
    const maxW = W - 60
    let size = Math.round(H * 0.42)
    let lines = [text]
    ctx.font = `800 ${size}px ${FONT}`
    if (ctx.measureText(text).width > maxW) {
      size = Math.round(H * 0.32)
      ctx.font = `800 ${size}px ${FONT}`
      const words = text.split(' ')
      let a = ''
      let i = 0
      for (; i < words.length; i++) {
        const t = a ? `${a} ${words[i]}` : words[i]
        if (ctx.measureText(t).width > maxW) break
        a = t
      }
      lines = [a, words.slice(i).join(' ')]
      while (ctx.measureText(lines[1]).width > maxW && size > 12) {
        size -= 2
        ctx.font = `800 ${size}px ${FONT}`
      }
    }
    ctx.fillStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 10
    const lh = size * 1.15
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh + 2))
    ctx.shadowBlur = 0
    tex.needsUpdate = true
  }
  return { tex, draw }
}

/** Широкая надпись для кнопки у табло (соотношение 3:1). */
export function wideLabelTexture(text: string): THREE.CanvasTexture {
  const key = `__wide${text}`
  const hit = cache.get(key)
  if (hit) return hit
  const W = 480
  const H = 160
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1b0f2b'
  let px = 96
  ctx.font = `900 ${px}px ${FONT}`
  while (ctx.measureText(text).width > W - 30 && px > 20) {
    px -= 2
    ctx.font = `900 ${px}px ${FONT}`
  }
  ctx.fillText(text, W / 2, H / 2 + 4)
  const tex = finish(canvas)
  cache.set(key, tex)
  return tex
}

// ---------- Текстуры эффектов слотов ----------

function fxCanvas(key: string, W: number, H: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  paint(canvas.getContext('2d')!)
  const tex = finish(canvas)
  cache.set(key, tex)
  return tex
}

/**
 * Диагональная полоса света для «блика». Текстура вдвое шире плитки, полоса — посередине,
 * края полностью прозрачные: при сдвиге offset.x по краям не «размазываются» пиксели полосы.
 */
export function glareTexture() {
  const tex = fxCanvas('__glare2', 1024, 256, (ctx) => {
    ctx.save()
    ctx.translate(512, 128)
    ctx.rotate(-0.5)
    const g = ctx.createLinearGradient(-60, 0, 60, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.75)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(-60, -260, 120, 520)
    ctx.restore()
  })
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.repeat.set(0.5, 1)
  return tex
}

/** Кольцо для «волны». */
export function ringTexture() {
  return fxCanvas('__ring', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 70, 128, 128, 126)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  })
}

/** Контур плитки для «бегущей рамки» (белый, красится цветом материала). */
export function frameTexture() {
  // Пропорции плашки навыка (460×248 из 512×300) + небольшой отступ, скругление как у плашки.
  return fxCanvas('__frame2', 500, 288, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 9
    roundRect(ctx, 8, 8, 484, 272, 50)
    ctx.stroke()
  })
}

/** Мягкое свечение вокруг плашки (подложка под выигравшим слотом). */
export function haloTexture() {
  return fxCanvas('__halo', 512, 320, (ctx) => {
    ctx.shadowColor = 'rgba(255,255,255,1)'
    ctx.shadowBlur = 40
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    roundRect(ctx, 70, 60, 372, 200, 44)
    ctx.fill()
  })
}

/** Мягкая светящаяся точка: огонёк рамки и искры. */
export function dotTexture() {
  return fxCanvas('__dot', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  })
}

// ---------- Бонус «Золотая папка» ----------

/** Силуэт папки-скоросшивателя: корешок-вкладка сверху слева и корпус. */
function folderPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const tabW = w * 0.38
  const tabH = h * 0.14
  const r = Math.min(w, h) * 0.07
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + tabW - r, y)
  ctx.quadraticCurveTo(x + tabW, y, x + tabW + tabH * 0.6, y + tabH)
  ctx.lineTo(x + w - r, y + tabH)
  ctx.arcTo(x + w, y + tabH, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function goldFolder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#fff1a8')
  g.addColorStop(0.35, '#ffd24a')
  g.addColorStop(0.7, '#e59a12')
  g.addColorStop(1, '#b8700a')
  folderPath(ctx, x, y, w, h)
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 7
  ctx.strokeStyle = '#7a4300'
  ctx.stroke()
  // Клапан — вторая пластина папки
  ctx.save()
  folderPath(ctx, x, y, w, h)
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(x, y + h * 0.26, w, h * 0.06)
  ctx.restore()
}

/** Scatter-символ на барабане: золотая папка «МАТЧ». Той же формы, что плитки навыков (512×300). */
export function scatterTexture(): THREE.CanvasTexture {
  const hit = cache.get('__scatter')
  if (hit) return hit
  const W = 512
  const H = 300
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  // Сияние
  const glow = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W / 2)
  glow.addColorStop(0, 'rgba(255,230,120,0.95)')
  glow.addColorStop(0.55, 'rgba(255,170,40,0.45)')
  glow.addColorStop(1, 'rgba(255,150,0,0)')
  roundRect(ctx, 26, 26, W - 52, H - 52, 44)
  ctx.fillStyle = '#3b0f52'
  ctx.fill()
  ctx.fillStyle = glow
  ctx.fill()
  // Лучи
  ctx.save()
  roundRect(ctx, 26, 26, W - 52, H - 52, 44)
  ctx.clip()
  ctx.translate(W / 2, H / 2)
  for (let i = 0; i < 16; i++) {
    ctx.rotate((Math.PI * 2) / 16)
    ctx.fillStyle = i % 2 ? 'rgba(255,240,170,0.18)' : 'rgba(255,200,80,0.1)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(300, -26)
    ctx.lineTo(300, 26)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  roundRect(ctx, 26, 26, W - 52, H - 52, 44)
  ctx.lineWidth = 8
  ctx.strokeStyle = '#ffd24a'
  ctx.stroke()

  goldFolder(ctx, 120, 52, 272, 196)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 84px ${FONT}`
  ctx.fillStyle = 'rgba(90,40,0,0.45)'
  ctx.fillText('MATCH', W / 2 + 3, 176)
  ctx.fillStyle = '#fffbe6'
  ctx.shadowColor = '#7a4300'
  ctx.shadowBlur = 6
  ctx.fillText('MATCH', W / 2, 172)
  ctx.shadowBlur = 0
  // Звёздочка-искра
  const star = (cx: number, cy: number, r: number) => {
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      const rr = i % 2 ? r * 0.3 : r
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fillStyle = '#fffbe6'
    ctx.fill()
  }
  star(400, 70, 22)
  star(108, 230, 16)
  const tex = finish(canvas)
  cache.set('__scatter', tex)
  return tex
}

/** Закрытая папка миниигры (лицевая сторона) с номером. */
export function folderFrontTexture(n: number): THREE.CanvasTexture {
  return fxCanvas(`__folderF${n}`, 400, 280, (ctx) => {
    goldFolder(ctx, 14, 14, 372, 252)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `900 40px ${FONT}`
    ctx.fillStyle = 'rgba(90,40,0,0.75)'
    ctx.fillText('RESUME', 200, 120)
    ctx.font = `900 64px ${FONT}`
    ctx.fillStyle = '#fffbe6'
    ctx.shadowColor = '#7a4300'
    ctx.shadowBlur = 6
    ctx.fillText(`#${n}`, 200, 190)
  })
}

/** Открытая папка: лист резюме со штампом. */
export function folderBackTexture(kind: 'hire' | 'reject' | 'empty' | 'shield'): THREE.CanvasTexture {
  return fxCanvas(`__folderB${kind}`, 400, 280, (ctx) => {
    goldFolder(ctx, 14, 14, 372, 252)
    // Лист
    ctx.save()
    ctx.translate(200, 150)
    ctx.rotate(-0.03)
    ctx.fillStyle = '#fbf7ee'
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 10
    ctx.fillRect(-150, -96, 300, 196)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#d8d0c0'
    for (let i = 0; i < 6; i++) ctx.fillRect(-120, -72 + i * 26, i % 3 === 2 ? 150 : 240, 8)
    ctx.restore()
    if (kind === 'empty') {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `800 46px ${FONT}`
      ctx.fillStyle = '#8a8274'
      ctx.fillText('empty', 200, 150)
      return
    }
    const color = kind === 'hire' ? '#12a64a' : kind === 'reject' ? '#e0243a' : '#2a8cf0'
    const text = kind === 'hire' ? 'MATCH' : kind === 'reject' ? 'MISS' : 'SHIELD'
    ctx.save()
    ctx.translate(200, 150)
    ctx.rotate(-0.2)
    ctx.strokeStyle = color
    ctx.lineWidth = 9
    roundRect(ctx, -132, -50, 264, 100, 16)
    ctx.stroke()
    ctx.lineWidth = 3
    roundRect(ctx, -120, -39, 240, 78, 10)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `900 ${kind === 'shield' ? 64 : 70}px ${FONT}`
    ctx.fillText(text, 0, 4)
    ctx.restore()
    if (kind === 'shield') {
      // Перечёркнутый отказ под щитом
      ctx.save()
      ctx.translate(200, 236)
      ctx.font = `800 30px ${FONT}`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#e0243a'
      ctx.fillText('miss', 0, 0)
      ctx.fillRect(-48, -2, 96, 5)
      ctx.restore()
    }
  })
}

/** Обратная сторона золотой папки при 3+: штамп «НАЙДЕНО» (512×300, как плитка). */
export function acceptedTexture(): THREE.CanvasTexture {
  return fxCanvas('__accepted2', 512, 300, (ctx) => {
    const W = 512
    const H = 300
    const g = ctx.createLinearGradient(0, 26, 0, H - 26)
    g.addColorStop(0, '#fff1a8')
    g.addColorStop(0.45, '#ffd24a')
    g.addColorStop(1, '#d58a0e')
    roundRect(ctx, 26, 26, W - 52, H - 52, 44)
    ctx.fillStyle = g
    ctx.fill()
    ctx.lineWidth = 8
    ctx.strokeStyle = '#7a4300'
    ctx.stroke()
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate(-0.12)
    ctx.strokeStyle = '#0f8a3c'
    ctx.lineWidth = 10
    roundRect(ctx, -196, -66, 392, 132, 20)
    ctx.stroke()
    ctx.lineWidth = 4
    roundRect(ctx, -180, -52, 360, 104, 12)
    ctx.stroke()
    ctx.fillStyle = '#0f8a3c'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let px = 92
    ctx.font = `900 ${px}px ${FONT}`
    while (ctx.measureText('FOUND').width > 330 && px > 40) ctx.font = `900 ${(px -= 2)}px ${FONT}`
    ctx.fillText('FOUND', 0, 6)
    ctx.restore()
  })
}
