import * as THREE from 'three'
import { getSkill } from '../game/skills'
import type { SkillId } from '../game/types'
import { SCATTER } from '../game/outcome'
import { BRAND, FOLDERS, MACHINE, pick, sayStable, WHEEL } from '../copy'

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
  fitFont(ctx, BRAND.name, 900, 132, W - 70)
  ctx.shadowColor = '#ff3fd8'
  ctx.shadowBlur = 40
  ctx.fillStyle = '#ffd6f7'
  ctx.fillText(BRAND.name, W / 2, H / 2 - 18)
  ctx.shadowBlur = 16
  ctx.fillText(BRAND.name, W / 2, H / 2 - 18)

  ctx.shadowColor = '#3ff6ff'
  ctx.shadowBlur = 18
  // Подзаголовок — случайный при загрузке, разрядка букв как у неоновой вывески.
  const tagline = [...pick(BRAND.taglines)].map((ch) => (ch === ' ' ? '  ' : ch)).join(' ')
  fitFont(ctx, tagline, 700, 38, W - 60)
  ctx.fillStyle = '#c9fbff'
  ctx.fillText(tagline, W / 2, H - 42)

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
  ctx.fillText(MACHINE.rule, 40, 52)
  ctx.fillStyle = '#9fe8ff'
  ctx.font = `600 34px ${FONT}`
  const joke = pick(MACHINE.ruleJokes)
  fitFont(ctx, joke, 600, 34, W - 60)
  ctx.fillText(joke, 40, 112)
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
    cell(W / 4, auto ? MACHINE.linesAutoLabel : MACHINE.linesLabel, String(lines), auto ? '#5cff9a' : '#ffd6f7')
    cell((W * 3) / 4, MACHINE.betLabel, `${cost} ◎`, '#ffd84a')
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
  const draw = (text: string, tone: 'idle' | 'spinning' | 'win' | 'bonus' | 'upgrade') => {
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#05020b'
    roundRect(ctx, 3, 3, W - 6, H - 6, 16)
    ctx.fill()
    ctx.strokeStyle = '#e7b64a'
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const color = tone === 'win' || tone === 'bonus' || tone === 'upgrade' ? '#ffd84a' : tone === 'spinning' ? '#9fe8ff' : '#fff2c4'
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
      const rest = words.slice(i).join(' ')
      // Уменьшенным шрифтом влезло в одну строку — рисуем одну, по центру.
      lines = rest ? [a, rest] : [a]
      while (lines[1] && ctx.measureText(lines[1]).width > maxW && size > 12) {
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

/** Надпись на шляпке круглой кнопки (SPIN, −, +): белая, с тёмной обводкой, на прозрачном фоне. */
export function capLabelTexture(text: string): THREE.CanvasTexture {
  const key = `__cap${text}`
  const hit = cache.get(key)
  if (hit) return hit
  const W = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = W
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const px = fitFont(ctx, text, 900, text.length <= 1 ? 190 : 84, W - 36)
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(8, px * 0.1)
  ctx.strokeStyle = 'rgba(70,0,20,0.85)'
  ctx.strokeText(text, W / 2, W / 2 + px * 0.04)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = '#ffffff'
  ctx.shadowBlur = 8
  ctx.fillText(text, W / 2, W / 2 + px * 0.04)
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
  ctx.fillText(FOLDERS.match, W / 2 + 3, 176)
  ctx.fillStyle = '#fffbe6'
  ctx.shadowColor = '#7a4300'
  ctx.shadowBlur = 6
  ctx.fillText(FOLDERS.match, W / 2, 172)
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
    ctx.fillText(FOLDERS.front, 200, 120)
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
      ctx.fillText(FOLDERS.empty, 200, 150)
      return
    }
    const color = kind === 'hire' ? '#12a64a' : kind === 'reject' ? '#e0243a' : '#2a8cf0'
    const text = kind === 'hire' ? FOLDERS.match : kind === 'reject' ? FOLDERS.miss : FOLDERS.shield
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
      ctx.fillText(FOLDERS.shieldBroken, 0, 0)
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
    while (ctx.measureText(MACHINE.scatterStamp).width > 330 && px > 40) ctx.font = `900 ${(px -= 2)}px ${FONT}`
    ctx.fillText(MACHINE.scatterStamp, 0, 6)
    ctx.restore()
  })
}


// ---------- Колесо торга (миниигра улучшения) ----------

const WHEEL_COLORS: Record<'win' | 'push' | 'lose', [string, string, string]> = {
  // [внутренний, внешний, альтернативный внешний — чтобы соседние сектора одного цвета различались]
  win: ['#7dffb8', '#12a862', '#0d8d51'],
  push: ['#fff1a6', '#e8b416', '#cf9d0b'],
  lose: ['#ff9aa4', '#d8243a', '#b81a2f'],
}
const WHEEL_ICONS = { win: '✔', push: '↻', lose: '✕' }

/** Запечатанный конверт с центром в (0, 0): клапан сверху, сургучная печать. */
function drawEnvelope(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = Math.max(3, w * 0.05)
  // Тень под конвертом.
  ctx.fillStyle = 'rgba(6,40,24,0.4)'
  roundRect(ctx, -w / 2 + w * 0.03, -h / 2 + h * 0.07, w, h, r)
  ctx.fill()
  // Бумага.
  const paper = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
  paper.addColorStop(0, '#fffaf0')
  paper.addColorStop(1, '#eedcb8')
  roundRect(ctx, -w / 2, -h / 2, w, h, r)
  ctx.fillStyle = paper
  ctx.fill()
  ctx.lineWidth = Math.max(2, w * 0.02)
  ctx.strokeStyle = '#a88a55'
  ctx.stroke()
  // Нижние сгибы.
  ctx.strokeStyle = 'rgba(150,115,60,0.5)'
  ctx.lineWidth = Math.max(1.5, w * 0.015)
  ctx.beginPath()
  ctx.moveTo(-w / 2 + r * 0.6, h / 2 - r * 0.6)
  ctx.lineTo(-w * 0.07, h * 0.04)
  ctx.moveTo(w / 2 - r * 0.6, h / 2 - r * 0.6)
  ctx.lineTo(w * 0.07, h * 0.04)
  ctx.stroke()
  // Клапан.
  ctx.beginPath()
  ctx.moveTo(-w / 2 + r * 0.4, -h / 2 + r * 0.4)
  ctx.lineTo(0, h * 0.14)
  ctx.lineTo(w / 2 - r * 0.4, -h / 2 + r * 0.4)
  ctx.closePath()
  const flap = ctx.createLinearGradient(0, -h / 2, 0, h * 0.14)
  flap.addColorStop(0, '#fbf0d8')
  flap.addColorStop(1, '#e6d0a4')
  ctx.fillStyle = flap
  ctx.fill()
  ctx.lineWidth = Math.max(2, w * 0.018)
  ctx.strokeStyle = '#a88a55'
  ctx.stroke()
  // Сургуч.
  const sr = Math.min(w, h) * 0.17
  const sy = h * 0.1
  const wax = ctx.createRadialGradient(-sr * 0.3, sy - sr * 0.3, sr * 0.1, 0, sy, sr)
  wax.addColorStop(0, '#ff5a64')
  wax.addColorStop(1, '#a3121f')
  ctx.beginPath()
  ctx.arc(0, sy, sr, 0, Math.PI * 2)
  ctx.fillStyle = wax
  ctx.fill()
  ctx.lineWidth = Math.max(1.5, sr * 0.14)
  ctx.strokeStyle = '#6e0a14'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, sy, sr * 0.58, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,190,190,0.55)'
  ctx.lineWidth = Math.max(1, sr * 0.1)
  ctx.stroke()
}

const ENV_ASPECT = 0.66

/**
 * Место для конверта в секторе [a0, a1] (углы canvas, по часовой). Перебирает радиус от обода внутрь
 * и размер от большого к меньшему; берёт первое положение, где все углы конверта вместе с тенью
 * лежат внутри сектора с отступом `pad` от боковых границ и обода. tilt — наклон конверта (рад),
 * shift — сдвиг по углу в долях свободного места. Если не влез даже без наклона — null.
 */
function fitEnvelope(c: number, R: number, a0: number, a1: number, tilt: number, shift: number) {
  const pad = 10
  const span = a1 - a0
  const inside = (x: number, y: number) => {
    const dx = x - c
    const dy = y - c
    const r = Math.hypot(dx, dy)
    if (r > R * 0.95 - pad || r < R * 0.28) return false
    let d = Math.atan2(dy, dx) - a0
    d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const m = pad / r
    return d >= m && d <= span - m
  }
  const fits = (mid: number, rr: number, w: number, rot: number) => {
    const h = w * ENV_ASPECT
    const x = c + Math.cos(mid) * rr
    const y = c + Math.sin(mid) * rr
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    // Углы конверта и тени (тень сдвинута на 3% ширины и 7% высоты).
    const xs = [-w / 2, w / 2 + w * 0.03]
    const ys = [-h / 2, h / 2 + h * 0.07]
    for (const lx of xs) for (const ly of ys) if (!inside(x + lx * cos - ly * sin, y + lx * sin + ly * cos)) return false
    return true
  }
  const at = (rr: number, w: number, t: number) => {
    // Сдвиг по углу — в пределах того, что остаётся свободным при этой ширине.
    const free = Math.max(0, span - (w * 1.2) / rr)
    const mid = a0 + span / 2 + shift * free
    const rot = mid + Math.PI / 2 + t
    return fits(mid, rr, w, rot) ? { x: c + Math.cos(mid) * rr, y: c + Math.sin(mid) * rr, w, rot } : null
  }
  const radii = Array.from({ length: 21 }, (_, k) => R * (0.8 - k * 0.02))
  // Обычно: конверт заметного размера (≥ 0,2 R) как можно ближе к ободу.
  for (const t of [tilt, tilt * 0.5, 0])
    for (const rr of radii)
      for (let w = R * 0.3; w >= R * 0.2; w -= R * 0.01) {
        const spot = at(rr, w, t)
        if (spot) return spot
      }
  // Узкий сектор: самый крупный конверт, какой влезает (при равенстве — ближе к ободу).
  let best: { x: number; y: number; w: number; rot: number } | null = null
  for (const t of [tilt * 0.5, 0])
    for (const rr of radii)
      for (let w = R * 0.2; w >= R * 0.08; w -= R * 0.005) {
        if (best && w <= best.w) break
        const spot = at(rr, w, t)
        if (spot) {
          best = spot
          break
        }
      }
  return best
}

/**
 * Лицо колеса: сектора по часовой стрелке от верха (как в upgrade.ts). Не кэшируется —
 * у каждой ступени своя раскладка; освобождает вызывающий (dispose).
 * На зелёных секторах вместо значка — запечатанный конверт с оффером, лежит чуть неровно
 * (наклон и сдвиг свои у каждого сектора). Что внутри, видно только в окошке после вращения.
 */
export function wheelFaceTexture(sectors: { kind: 'win' | 'push' | 'lose'; start: number; size: number }[]): THREE.CanvasTexture {
  const S = 1024
  const c = S / 2
  const R = S / 2 - 4
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  const TAU = Math.PI * 2
  sectors.forEach((sec, i) => {
    if (sec.size <= 0) return
    const a0 = -Math.PI / 2 + sec.start * TAU
    const a1 = a0 + sec.size * TAU
    const [inner, outer, alt] = WHEEL_COLORS[sec.kind]
    const g = ctx.createRadialGradient(c, c, R * 0.15, c, c, R)
    g.addColorStop(0, inner)
    g.addColorStop(1, i % 2 ? alt : outer)
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.arc(c, c, R, a0, a1)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
    // Разделитель.
    ctx.strokeStyle = 'rgba(20,6,30,0.85)'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.lineTo(c + Math.cos(a0) * R, c + Math.sin(a0) * R)
    ctx.stroke()
    // Конверт на зелёном секторе: клапан смотрит к ободу, наклон и сдвиг — случайные, но стабильные
    // для сектора. Место подбирается так, чтобы конверт (с тенью) целиком лежал внутри сектора
    // с отступом от границ: как можно ближе к ободу и как можно крупнее.
    if (sec.kind === 'win') {
      const jr = rng(i * 7919 + Math.round(sec.start * 1e4) + 17)
      const spot = fitEnvelope(c, R, a0, a1, (jr() - 0.5) * 0.6, (jr() - 0.5) * 0.3)
      if (spot) {
        ctx.save()
        ctx.translate(spot.x, spot.y)
        ctx.rotate(spot.rot)
        drawEnvelope(ctx, spot.w, spot.w * ENV_ASPECT)
        ctx.restore()
      }
      return
    }
    // Значок по радиусу — только если сектор достаточно широкий.
    const arcLen = sec.size * TAU * R * 0.74
    if (arcLen < 26) return
    const mid = (a0 + a1) / 2
    const px = Math.min(76, arcLen * 0.8)
    ctx.save()
    ctx.translate(c + Math.cos(mid) * R * 0.74, c + Math.sin(mid) * R * 0.74)
    ctx.rotate(mid + Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `900 ${px}px ${FONT}`
    ctx.fillStyle = 'rgba(20,6,30,0.35)'
    ctx.fillText(WHEEL_ICONS[sec.kind], 3, 4)
    ctx.fillStyle = sec.kind === 'push' ? '#3a2600' : '#ffffff'
    ctx.fillText(WHEEL_ICONS[sec.kind], 0, 0)
    ctx.restore()
  })
  // Внутреннее кольцо под ступицу.
  ctx.beginPath()
  ctx.arc(c, c, R * 0.24, 0, TAU)
  ctx.fillStyle = '#1a0b2a'
  ctx.fill()
  return finish(canvas)
}

/** Кнопка у колеса: крупная надпись + подпись, цвет по тону. Кэшируется по содержимому. */
export function wheelButtonTexture(title: string, sub: string, tone: 'spin' | 'take' | 'off'): THREE.CanvasTexture {
  return fxCanvas(`__wbtn${tone}|${title}|${sub}`, 512, 208, (ctx) => {
    const [top, bottom, edge, text] =
      tone === 'spin' ? ['#6dffb0', '#0f9a58', '#053d22', '#04220f'] : tone === 'take' ? ['#ffe58a', '#d99a12', '#5a3a00', '#2a1600'] : ['#8a8496', '#4a4456', '#1c1824', '#1c1824']
    const g = ctx.createLinearGradient(0, 0, 0, 208)
    g.addColorStop(0, top)
    g.addColorStop(1, bottom)
    roundRect(ctx, 8, 8, 496, 192, 40)
    ctx.fillStyle = g
    ctx.fill()
    ctx.lineWidth = 8
    ctx.strokeStyle = edge
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    roundRect(ctx, 26, 20, 460, 50, 24)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = text
    fitFont(ctx, title, 900, 78, 440)
    ctx.fillText(title, 256, sub ? 88 : 106)
    if (sub) {
      fitFont(ctx, sub, 800, 36, 440)
      ctx.fillText(sub, 256, 156)
    }
  })
}

export interface WheelPanelInfo {
  /** Совпавшие навыки текущего держателя; fresh — добавились последней победой. */
  skills: { id: SkillId; fresh: boolean }[]
  grade: number
  path: number[]
  nextGrade: number | null
  odds: number
  status: 'ready' | 'spinning' | 'lost' | 'max'
  last: 'win' | 'push' | 'lose' | null
  /** Держатель — максимум совпадений во всём пуле (UNICORN), а не просто лучший из оставшихся. */
  unicorn: boolean
}

/** Табло у колеса: кого держим, лесенка грейдов, шанс. Не кэшируется — освобождает вызывающий. */
export function wheelPanelTexture(info: WheelPanelInfo): THREE.CanvasTexture {
  const W = 640
  const H = 560
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  displayPanel(ctx, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#e7b64a'
  ctx.font = `900 34px ${FONT}`
  ctx.fillText(WHEEL.title, W / 2, 52)

  ctx.fillStyle = 'rgba(255,242,196,0.6)'
  ctx.font = `800 26px ${FONT}`
  // Одно и то же состояние колеса → одна и та же фраза (текстура перерисовывается много раз).
  const key = `${info.status}|${info.last}|${info.path.join('.')}`
  const head = sayStable(info.status === 'lost' ? WHEEL.headLost : info.path.length > 1 ? WHEEL.headSigned : WHEEL.headHolding, key)
  const headLine = `${head} · ×${info.grade} ★`
  fitFont(ctx, headLine, 800, 26, W - 60)
  ctx.fillText(headLine, W / 2, 100)

  // Теги совпавших навыков вместо имени — на колесе ставятся навыки, а не люди.
  // Раскладка: 1–2 ряда по центру, шрифт подстраивается под число тегов.
  const tags = info.skills
  const rows = tags.length > 5 ? 2 : 1
  const perRow = Math.ceil(tags.length / rows) || 1
  const gap = 10
  const tagH = rows === 2 ? 50 : 62
  const areaW = W - 50
  const px = rows === 2 ? 24 : 28
  tags.forEach((t, i) => {
    const row = Math.floor(i / perRow)
    const inRow = row === rows - 1 ? tags.length - perRow * (rows - 1) : perRow
    const col = i - row * perRow
    const w = (areaW - gap * (perRow - 1)) / perRow
    const rowW = inRow * w + (inRow - 1) * gap
    const x = (W - rowW) / 2 + col * (w + gap)
    const y = (rows === 2 ? 128 : 150) + row * (tagH + gap)
    const skill = getSkill(t.id)
    roundRect(ctx, x, y, w, tagH, 14)
    ctx.fillStyle = info.status === 'lost' ? '#4a4456' : skill.color
    ctx.fill()
    if (t.fresh && info.status !== 'lost') {
      ctx.lineWidth = 5
      ctx.strokeStyle = '#5cff9a'
      ctx.stroke()
    }
    const dark = luminance(skill.color) > 0.45
    ctx.fillStyle = info.status === 'lost' ? '#9a94a6' : dark ? '#16121f' : '#ffffff'
    const label = t.fresh && info.status !== 'lost' ? `+${skill.label}` : skill.label
    fitFont(ctx, label, 800, px, w - 12)
    ctx.fillText(label, x + w / 2, y + tagH / 2 + 1)
  })

  // Лесенка грейдов: пройденные — золотом, цель — «?», потолок — MAX.
  const steps = info.path.map((g) => `${g}★`)
  const tail = info.status === 'max' ? 'MAX' : info.nextGrade != null && info.status !== 'lost' ? `${info.nextGrade}★?` : ''
  const items = tail ? [...steps, tail] : steps
  const shown = items.slice(-5)
  const cellW = Math.min(118, (W - 60) / shown.length)
  const y = 300
  shown.forEach((t, i) => {
    const x = W / 2 + (i - (shown.length - 1) / 2) * cellW
    const isTail = tail && i === shown.length - 1
    const isCur = isTail ? false : i === shown.length - (tail ? 2 : 1)
    roundRect(ctx, x - cellW / 2 + 6, y - 32, cellW - 12, 64, 14)
    ctx.fillStyle = isTail ? (info.status === 'max' ? '#ffd84a' : 'rgba(255,255,255,0.08)') : isCur ? '#e7b64a' : 'rgba(231,182,74,0.35)'
    ctx.fill()
    if (isTail && info.status !== 'max') {
      ctx.setLineDash([8, 6])
      ctx.strokeStyle = '#9fe8ff'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.fillStyle = isTail && info.status !== 'max' ? '#9fe8ff' : '#1b0f2b'
    fitFont(ctx, t, 900, 32, cellW - 20)
    ctx.fillText(t, x, y + 2)
  })

  let line1 = ''
  let line2 = ''
  let color = '#fff2c4'
  if (info.status === 'lost') ((line1 = WHEEL.lostTitle), (line2 = sayStable(WHEEL.lost, key)), (color = '#ff6b7a'))
  else if (info.status === 'max') ((line1 = WHEEL.maxTitle), (line2 = sayStable(info.unicorn ? WHEEL.maxUnicorn : WHEEL.maxLeft, key)), (color = '#ffd84a'))
  else if (info.status === 'spinning') ((line1 = sayStable(WHEEL.spinning, key)), (line2 = WHEEL.odds(info.odds)), (color = '#9fe8ff'))
  else {
    line1 = WHEEL.oddsTitle(info.odds)
    line2 = info.last === 'push' ? sayStable(WHEEL.push, key) : WHEEL.legend
    color = info.last === 'push' ? '#ffd84a' : '#5cff9a'
  }
  ctx.fillStyle = color
  fitFont(ctx, line1, 900, 52, W - 60)
  ctx.fillText(line1, W / 2, 410)
  ctx.fillStyle = 'rgba(255,242,196,0.7)'
  fitFont(ctx, line2, 700, 28, W - 60)
  ctx.fillText(line2, W / 2, 470)
  return finish(canvas)
}

/** Цветная плашка навыка (как теги на табло). */
function drawSkillChip(ctx: CanvasRenderingContext2D, id: SkillId, x: number, y: number, w: number, h: number, px: number, plus: boolean) {
  const skill = getSkill(id)
  roundRect(ctx, x, y, w, h, Math.min(16, h / 3))
  ctx.fillStyle = skill.color
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#5cff9a'
  ctx.stroke()
  ctx.fillStyle = luminance(skill.color) > 0.45 ? '#16121f' : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const label = plus ? `+${skill.label}` : skill.label
  fitFont(ctx, label, 800, px, w - 14)
  ctx.fillText(label, x + w / 2, y + h / 2 + 1)
}

/** Что показывает окошко над стрелкой колеса. */
export type WheelWindowView =
  | { kind: 'envelope' }
  | { kind: 'won'; skills: SkillId[] }
  | { kind: 'push' }
  | { kind: 'lose' }

export const WHEEL_WINDOW_W = 768
export const WHEEL_WINDOW_H = 176
/**
 * Окошко над стрелкой, как в телешоу: что сейчас под стрелкой. Зелёный — запечатанный конверт
 * (что внутри, не видно), жёлтый — респин, красный — «ушёл»; после победы — теги выигранных
 * навыков. Кэшируется по содержимому — вариантов мало, при вращении не рисуется заново.
 */
export function wheelWindowTexture(view: WheelWindowView): THREE.CanvasTexture {
  const skills = view.kind === 'won' ? view.skills : []
  const key = `__wwin${view.kind}|${skills.join(',')}`
  const W = WHEEL_WINDOW_W
  const H = WHEEL_WINDOW_H
  return fxCanvas(key, W, H, (ctx) => {
    const edge = view.kind === 'lose' ? '#ff4d6a' : view.kind === 'push' ? '#ffd84a' : '#5cff9a'
    ctx.clearRect(0, 0, W, H)
    roundRect(ctx, 5, 5, W - 10, H - 10, 26)
    ctx.fillStyle = '#05020b'
    ctx.fill()
    ctx.lineWidth = 10
    ctx.strokeStyle = edge
    ctx.stroke()
    // Внутренний отсвет по цвету исхода.
    const glow = ctx.createLinearGradient(0, 0, 0, H)
    glow.addColorStop(0, edge + '33')
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    roundRect(ctx, 14, 14, W - 28, H - 28, 20)
    ctx.fillStyle = glow
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (view.kind === 'envelope') {
      // Запечатанный конверт, чуть наискосок.
      ctx.save()
      ctx.translate(W / 2, H / 2 + 4)
      ctx.rotate(-0.07)
      drawEnvelope(ctx, 200, 132)
      ctx.restore()
      return
    }
    if (view.kind === 'push' || view.kind === 'lose') {
      const text = view.kind === 'push' ? WHEEL.windowPush : WHEEL.windowLose
      ctx.fillStyle = edge
      fitFont(ctx, text, 900, 70, W - 80)
      ctx.fillText(text, W / 2, H / 2 + 3)
      return
    }
    // Выигранные навыки: до 4 в ряд, больше — в два ряда.
    const list = skills.slice(0, 8)
    const rows = list.length > 4 ? 2 : 1
    const perRow = Math.ceil(list.length / rows) || 1
    const gap = 12
    const areaW = W - 60
    const chipH = rows === 2 ? 60 : 118
    const top = rows === 2 ? (H - chipH * 2 - gap) / 2 : (H - chipH) / 2
    list.forEach((id, i) => {
      const row = Math.floor(i / perRow)
      const inRow = row === rows - 1 ? list.length - perRow * (rows - 1) : perRow
      const col = i - row * perRow
      const w = Math.min(rows === 2 ? 300 : 380, (areaW - gap * (perRow - 1)) / perRow)
      const rowW = inRow * w + (inRow - 1) * gap
      drawSkillChip(ctx, id, (W - rowW) / 2 + col * (w + gap), top + row * (chipH + gap), w, chipH, rows === 2 ? 32 : 60, true)
    })
  })
}

/** Отдельная плашка «+навык» — летит из окошка на табло при победе. Кэшируется. */
export function skillChipTexture(id: SkillId): THREE.CanvasTexture {
  return fxCanvas(`__chip|${id}`, 320, 96, (ctx) => drawSkillChip(ctx, id, 6, 6, 308, 84, 44, true))
}

// ---------- Вывеска: табло статистики, кредиты, клавиши ----------

/** Чёрное табло с золотой рамкой — общий фон для табло на вывеске. */
function displayPanel(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#05020b'
  roundRect(ctx, 3, 3, W - 6, H - 6, 18)
  ctx.fill()
  ctx.strokeStyle = '#e7b64a'
  ctx.lineWidth = 6
  ctx.stroke()
}

/** Уменьшает шрифт, пока строка не влезет в ширину. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number) {
  let px = size
  ctx.font = `${weight} ${px}px ${FONT}`
  while (ctx.measureText(text).width > maxW && px > 10) {
    px -= 2
    ctx.font = `${weight} ${px}px ${FONT}`
  }
  return px
}

/** Табло статистики на вывеске: строка источника данных + ячейки «подпись / число». */
export function makeStatsDisplay(W: number, H: number) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const tex = finish(canvas)
  const draw = (status: string, dot: string, cells: { label: string; value: string }[]) => {
    displayPanel(ctx, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Источник данных
    const sy = H * 0.24
    const size = fitFont(ctx, status, 700, Math.round(H * 0.15), W - 110)
    const tw = ctx.measureText(status).width
    ctx.fillStyle = dot
    ctx.shadowColor = dot
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.arc(W / 2 - tw / 2 - size * 0.7, sy, size * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#c9fbff'
    ctx.shadowColor = '#3ff6ff'
    ctx.shadowBlur = 8
    ctx.fillText(status, W / 2 + size * 0.2, sy + 1)
    ctx.shadowBlur = 0
    // Разделитель
    ctx.strokeStyle = 'rgba(231,182,74,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(24, H * 0.4)
    ctx.lineTo(W - 24, H * 0.4)
    ctx.stroke()
    // Ячейки
    const cw = (W - 30) / cells.length
    cells.forEach((c, i) => {
      const cx = 15 + cw * (i + 0.5)
      if (i > 0) {
        ctx.strokeStyle = 'rgba(231,182,74,0.25)'
        ctx.beginPath()
        ctx.moveTo(15 + cw * i, H * 0.5)
        ctx.lineTo(15 + cw * i, H * 0.9)
        ctx.stroke()
      }
      ctx.fillStyle = '#9fe8ff'
      fitFont(ctx, c.label, 700, Math.round(H * 0.12), cw - 16)
      ctx.fillText(c.label, cx, H * 0.53)
      ctx.fillStyle = '#ffd6f7'
      ctx.shadowColor = '#ff3fd8'
      ctx.shadowBlur = 10
      fitFont(ctx, c.value, 900, Math.round(H * 0.28), cw - 16)
      ctx.fillText(c.value, cx, H * 0.76)
      ctx.shadowBlur = 0
    })
    tex.needsUpdate = true
  }
  return { tex, draw }
}

/** Табло кредитов на вывеске. Когда кредиты кончились — мигает просьба к HRD (по клику). */
export function makeCreditsDisplay(W: number, H: number) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const tex = finish(canvas)
  const draw = (value: number, refill: number | null, blink: boolean) => {
    displayPanel(ctx, W, H)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#9fe8ff'
    ctx.font = `700 ${Math.round(H * 0.13)}px ${FONT}`
    ctx.fillText(MACHINE.credits, W / 2, H * 0.19)
    const text = `◎ ${value.toLocaleString('en-US')}`
    ctx.fillStyle = '#ffd84a'
    ctx.shadowColor = '#ffb000'
    ctx.shadowBlur = 16
    fitFont(ctx, text, 900, Math.round(H * (refill != null ? 0.36 : 0.44)), W - 40)
    ctx.fillText(text, W / 2, refill != null ? H * 0.5 : H * 0.6)
    ctx.shadowBlur = 0
    if (refill != null) {
      // Фраза фиксирована на время «банкротства» (ключ — текущее значение), иначе мигание меняло бы текст.
      const ask = sayStable(MACHINE.askBudget, value, refill)
      ctx.fillStyle = blink ? '#ff3fd8' : '#7a2a6a'
      ctx.shadowColor = '#ff3fd8'
      ctx.shadowBlur = blink ? 12 : 0
      fitFont(ctx, ask, 800, Math.round(H * 0.14), W - 30)
      ctx.fillText(ask, W / 2, H * 0.8)
      ctx.shadowBlur = 0
    }
    tex.needsUpdate = true
  }
  return { tex, draw }
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

function gearPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  const teeth = 8
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i * Math.PI) / teeth - Math.PI / teeth / 2
    const a1 = a0 + Math.PI / teeth
    const rr = i % 2 ? r * 0.78 : r
    ctx.arc(cx, cy, rr, a0, a1)
  }
  ctx.closePath()
  ctx.moveTo(cx + r * 0.34, cy)
  ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2, true)
}

/** Надпись клавиши на вывеске: значок (звезда/шестерёнка), подпись и счётчик. */
export function iconKeyTexture(icon: 'star' | 'gear', sub: string, count?: number): THREE.CanvasTexture {
  const key = `__ikey${icon}|${sub}|${count ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  const W = 256
  const H = 280
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#1b0f2b'
  if (icon === 'star') starPath(ctx, W / 2, H * 0.4, 78)
  else gearPath(ctx, W / 2, H * 0.4, 72)
  ctx.fill('evenodd')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitFont(ctx, sub, 900, 40, W - 20)
  ctx.fillText(sub, W / 2, H * 0.85)
  if (count != null) {
    const txt = String(count)
    ctx.font = `900 46px ${FONT}`
    const bw = Math.max(64, ctx.measureText(txt).width + 30)
    ctx.fillStyle = '#ff3fd8'
    roundRect(ctx, W - bw - 8, 8, bw, 64, 32)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(txt, W - bw / 2 - 8, 42)
  }
  const tex = finish(canvas)
  cache.set(key, tex)
  return tex
}

// ---------- Фон: ночной офис ----------

/** Детерминированный ГСЧ — фон одинаковый при каждой загрузке. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Задник «пустой офис ночью» (рисуется один раз): панорамные окна с огнями города,
 * ряды столов с мониторами в режиме заставки, дежурная лампа, табличка EXIT и
 * розово-голубые отсветы неона автомата. Самое интересное — у краёв: центр закрыт автоматом.
 */
export function nightOfficeTexture(): THREE.CanvasTexture {
  const hit = cache.get('__nightOffice')
  if (hit) return hit
  const W = 2560
  const H = 1280
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const rand = rng(20260924)

  // Стена
  let g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#06051a')
  g.addColorStop(1, '#0d0a1e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Окна: небо и город
  const winTop = H * 0.07
  const winBot = H * 0.6
  g = ctx.createLinearGradient(0, winTop, 0, winBot)
  g.addColorStop(0, '#070b2a')
  g.addColorStop(0.7, '#15123c')
  g.addColorStop(1, '#2a1740')
  ctx.fillStyle = g
  ctx.fillRect(0, winTop, W, winBot - winTop)
  // Звёзды
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(220,225,255,${0.25 + rand() * 0.5})`
    ctx.fillRect(rand() * W, winTop + rand() * (winBot - winTop) * 0.45, 2, 2)
  }
  // Луна — в правом верхнем углу
  ctx.fillStyle = '#e9e6ff'
  ctx.shadowColor = '#b9b4ff'
  ctx.shadowBlur = 40
  ctx.beginPath()
  ctx.arc(W * 0.965, winTop + 70, 30, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  // Три слоя домов: дальние — синие и тусклые, ближние — тёмные с тёплыми окнами
  const layers = [
    { h: [0.18, 0.38], body: '#141a3e', lit: ['rgba(140,170,255,0.55)', 'rgba(200,210,255,0.4)'], p: 0.3, win: 6 },
    { h: [0.12, 0.3], body: '#0f1230', lit: ['rgba(255,214,140,0.8)', 'rgba(170,220,255,0.7)'], p: 0.35, win: 8 },
    { h: [0.06, 0.2], body: '#0a0b22', lit: ['rgba(255,196,110,0.95)', 'rgba(255,240,200,0.8)'], p: 0.3, win: 10 },
  ]
  layers.forEach((L, li) => {
    let x = -20
    while (x < W) {
      const bw = 60 + rand() * 140 + li * 30
      const top = winTop + (winBot - winTop) * (L.h[0] + rand() * (L.h[1] - L.h[0])) + li * 40
      ctx.fillStyle = L.body
      ctx.fillRect(x, top, bw, winBot - top)
      for (let wy = top + 12; wy < winBot - 8; wy += L.win + 6)
        for (let wx = x + 8; wx < x + bw - 8; wx += L.win + 5)
          if (rand() < L.p) {
            ctx.fillStyle = L.lit[rand() < 0.7 ? 0 : 1]
            ctx.fillRect(wx, wy, L.win - 2, L.win)
          }
      if (li === 0 && rand() < 0.25) {
        ctx.fillStyle = '#ff3b4a'
        ctx.shadowColor = '#ff3b4a'
        ctx.shadowBlur = 14
        ctx.fillRect(x + bw / 2 - 3, top - 6, 6, 6)
        ctx.shadowBlur = 0
      }
      x += bw + rand() * 25
    }
  })
  // Блик на стекле
  g = ctx.createLinearGradient(0, winTop, W * 0.3, winBot)
  g.addColorStop(0, 'rgba(160,180,255,0.07)')
  g.addColorStop(0.5, 'rgba(160,180,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, winTop, W, winBot - winTop)
  // Импосты окна
  ctx.fillStyle = '#05040f'
  for (let i = 0; i <= 12; i++) ctx.fillRect((i * W) / 12 - 7, winTop, 14, winBot - winTop)
  ctx.fillRect(0, winTop + (winBot - winTop) * 0.62, W, 8)
  // Подоконник и потолок
  ctx.fillStyle = '#1a1630'
  ctx.fillRect(0, winBot, W, 12)
  ctx.fillStyle = '#04030c'
  ctx.fillRect(0, 0, W, winTop)
  // Светильники в потолке — выключены, один дежурный горит
  for (let i = 0; i < 8; i++) {
    const lx = W * (0.04 + i * 0.13)
    ctx.fillStyle = i === 0 || i === 7 ? '#8fa6ff' : '#15142a'
    ctx.fillRect(lx, winTop * 0.35, W * 0.07, 10)
  }
  g = ctx.createRadialGradient(W * 0.075, winTop * 0.4, 0, W * 0.075, winTop * 0.4, 260)
  g.addColorStop(0, 'rgba(143,166,255,0.35)')
  g.addColorStop(1, 'rgba(143,166,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W * 0.3, H * 0.4)
  // Табличка EXIT
  ctx.fillStyle = '#0a2a14'
  roundRect(ctx, W * 0.9, winTop * 0.18, 120, 46, 6)
  ctx.fill()
  ctx.fillStyle = '#3dff7a'
  ctx.shadowColor = '#3dff7a'
  ctx.shadowBlur = 18
  ctx.font = `800 32px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('EXIT', W * 0.9 + 60, winTop * 0.18 + 24)
  ctx.shadowBlur = 0

  // Столы с мониторами
  const deskY = H * 0.78
  ctx.fillStyle = '#0b0918'
  ctx.fillRect(0, winBot + 12, W, deskY - winBot)
  for (let x = 30; x < W; x += 230 + rand() * 60) {
    const on = rand() < 0.75
    const mw = 120 + rand() * 40
    const mh = mw * 0.6
    const my = deskY - mh - 22
    // Отсвет экрана на стене и столе
    if (on) {
      const hue = rand() < 0.5 ? '63,170,255' : rand() < 0.5 ? '120,90,255' : '63,246,255'
      g = ctx.createRadialGradient(x + mw / 2, my + mh / 2, 10, x + mw / 2, my + mh / 2, mw * 1.4)
      g.addColorStop(0, `rgba(${hue},0.28)`)
      g.addColorStop(1, `rgba(${hue},0)`)
      ctx.fillStyle = g
      ctx.fillRect(x - mw, my - mw, mw * 3, mh + mw * 2)
      ctx.fillStyle = '#05040c'
      ctx.fillRect(x - 6, my - 6, mw + 12, mh + 12)
      g = ctx.createLinearGradient(x, my, x + mw, my + mh)
      g.addColorStop(0, `rgba(${hue},0.9)`)
      g.addColorStop(1, `rgba(${hue},0.45)`)
      ctx.fillStyle = g
      ctx.fillRect(x, my, mw, mh)
      // Строки кода на заставке
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      for (let ly = my + 10; ly < my + mh - 8; ly += 11) ctx.fillRect(x + 10 + rand() * 12, ly, 20 + rand() * (mw - 50), 4)
    } else {
      ctx.fillStyle = '#05040c'
      ctx.fillRect(x - 6, my - 6, mw + 12, mh + 12)
      ctx.fillStyle = '#10101e'
      ctx.fillRect(x, my, mw, mh)
    }
    ctx.fillStyle = '#05040c'
    ctx.fillRect(x + mw / 2 - 6, my + mh, 12, 22)
  }
  // Столешница
  ctx.fillStyle = '#1b1730'
  ctx.fillRect(0, deskY, W, 14)
  ctx.fillStyle = '#07060f'
  ctx.fillRect(0, deskY + 14, W, H - deskY)
  // Спинки кресел
  for (let x = 60; x < W; x += 250 + rand() * 50) {
    ctx.fillStyle = '#04030a'
    roundRect(ctx, x, deskY + 40 + rand() * 30, 110, 170, 26)
    ctx.fill()
  }
  // Дежурная настольная лампа слева
  const lx = W * 0.035
  g = ctx.createRadialGradient(lx, deskY, 10, lx, deskY, 320)
  g.addColorStop(0, 'rgba(255,190,110,0.5)')
  g.addColorStop(1, 'rgba(255,190,110,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, deskY - 320, lx + 320, 400)
  ctx.fillStyle = '#ffcf7a'
  ctx.beginPath()
  ctx.moveTo(lx - 40, deskY - 90)
  ctx.lineTo(lx + 40, deskY - 90)
  ctx.lineTo(lx + 22, deskY - 130)
  ctx.lineTo(lx - 22, deskY - 130)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#2a2233'
  ctx.fillRect(lx - 4, deskY - 90, 8, 90)
  // Растения по краям
  for (const px of [W * 0.012, W * 0.985]) {
    ctx.fillStyle = '#03020a'
    ctx.fillRect(px - 30, H * 0.86, 60, H * 0.14)
    for (let i = 0; i < 9; i++) {
      ctx.beginPath()
      ctx.ellipse(px + (rand() - 0.5) * 90, H * 0.8 - rand() * 150, 18, 60, (rand() - 0.5) * 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Отсветы неона автомата на стенах: розовый слева, голубой справа
  ctx.globalCompositeOperation = 'lighter'
  for (const [cx, col] of [
    [0.3, '255,63,216'],
    [0.7, '63,246,255'],
  ] as const) {
    g = ctx.createRadialGradient(W * cx, H * 0.5, 50, W * cx, H * 0.5, W * 0.42)
    g.addColorStop(0, `rgba(${col},0.16)`)
    g.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  ctx.globalCompositeOperation = 'source-over'

  const tex = finish(canvas)
  cache.set('__nightOffice', tex)
  return tex
}
