import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { MAX_LINES, minLinesFor, REELS, type Payline } from '../game/outcome'
import { Reel } from './Reel'
import { BonusBoard } from './BonusBoard'
import { UpgradeWheel } from './UpgradeWheel'
import { Sparks } from './Sparks'
import { iconKeyTexture, keyLabelTexture, lineTagTexture, wideLabelTexture, makeCreditsDisplay, makeLinesDisplay, makeMessageDisplay, makeStatsDisplay, signTexture } from './textures'
import { describeFilter } from '../game/store'
import { plural, REFILL_AMOUNT } from '../game/economy'
import { openSettings, openShortlist } from '../ui/uiState'
import { sfx } from '../audio/sfx'
import { BASE_WIN_H, BASE_WIN_W, REEL_GAP, reelX, ROW_H, rowY, useLayoutVersion, WIN_H, WIN_W } from './layout'

const SIDE = 0.72
const OUTER_W = () => WIN_W + SIDE * 2
const DEPTH = 2.2
const FRONT_Z = 0.42
const BODY_Z = FRONT_Z - DEPTH / 2
const TOP_H = 0.4
/** Полоса под окном — на ней табло сообщений и табло линий/ставки. */
const BOT_H = 0.66
/** Высота тумбы под окном и вывески над ним. */
const BASE_H = 1.9
const SIGN_H = 1.3
const DECK_Y = () => -WIN_H / 2 - BOT_H - 0.02
/** Портретный экран: клавиши крупнее и в два ряда. */
const isCompact = (aspect: number) => aspect < 0.9
const deckDepth = (compact: boolean) => (compact ? 1.9 : 1.0)
/** Наклон панели: на портрете сильнее к зрителю, иначе её почти не видно. */
const deckTilt = (compact: boolean) => (compact ? 1.0 : 0.32)

const BODY = '#4a1370'
const BODY_DARK = '#240838'
const GOLD = '#e7b64a'
const RED = '#ff2d55'

/** Пресеты числа линий на клавишах панели. */
export const LINE_PRESETS = [1, 4, 9, 15, 25]

function useHoverCursor() {
  return {
    onPointerOver: () => (document.body.style.cursor = 'pointer'),
    onPointerOut: () => (document.body.style.cursor = ''),
  }
}

function shadowGradientTexture(flip: boolean) {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 128)
  g.addColorStop(flip ? 1 : 0, 'rgba(10,2,18,0.95)')
  g.addColorStop(flip ? 0 : 1, 'rgba(10,2,18,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Cabinet() {
  useLayoutVersion()
  const topShade = useMemo(() => shadowGradientTexture(false), [])
  const botShade = useMemo(() => shadowGradientTexture(true), [])
  const bodyMat = <meshStandardMaterial color={BODY} metalness={0.35} roughness={0.38} />
  const goldMat = <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.28} emissive={GOLD} emissiveIntensity={0.08} />

  return (
    <group>
      {/* Стенки корпуса вокруг окна */}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[SIDE, WIN_H + TOP_H + BOT_H, DEPTH]} radius={0.08} position={[s * (WIN_W / 2 + SIDE / 2), (TOP_H - BOT_H) / 2, BODY_Z]}>
          {bodyMat}
        </RoundedBox>
      ))}
      <RoundedBox args={[OUTER_W(), TOP_H, DEPTH]} radius={0.08} position={[0, WIN_H / 2 + TOP_H / 2, BODY_Z]}>
        {bodyMat}
      </RoundedBox>
      <RoundedBox args={[OUTER_W(), BOT_H, DEPTH]} radius={0.08} position={[0, -WIN_H / 2 - BOT_H / 2, BODY_Z]}>
        {bodyMat}
      </RoundedBox>
      {/* Задняя стенка */}
      <mesh position={[0, 0, FRONT_Z - DEPTH + 0.05]}>
        <boxGeometry args={[WIN_W, WIN_H, 0.1]} />
        <meshStandardMaterial color={BODY_DARK} />
      </mesh>

      {/* Золотая рамка окна */}
      <mesh position={[0, WIN_H / 2 + 0.04, FRONT_Z + 0.02]}>
        <boxGeometry args={[WIN_W + 0.16, 0.08, 0.06]} />
        {goldMat}
      </mesh>
      <mesh position={[0, -WIN_H / 2 - 0.04, FRONT_Z + 0.02]}>
        <boxGeometry args={[WIN_W + 0.16, 0.08, 0.06]} />
        {goldMat}
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WIN_W / 2 + 0.04), 0, FRONT_Z + 0.02]}>
          <boxGeometry args={[0.08, WIN_H + 0.16, 0.06]} />
          {goldMat}
        </mesh>
      ))}

      {/* Разделители барабанов */}
      {Array.from({ length: REELS - 1 }, (_, i) => (
        <mesh key={i} position={[(i - (REELS - 2) / 2) * REEL_GAP, 0, -0.2]}>
          <boxGeometry args={[0.07, WIN_H, 0.4]} />
          <meshStandardMaterial color="#12051c" />
        </mesh>
      ))}

      {/* Тени сверху/снизу окна — объём барабанов. Перед плитками (z 0.32), иначе совпадали
          по глубине с «выпрыгнувшими» слотами и давали полосатые артефакты (z-fighting). */}
      <mesh position={[0, WIN_H / 2 - 0.4, 0.32]}>
        <planeGeometry args={[WIN_W, 0.8]} />
        <meshBasicMaterial map={topShade} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, -WIN_H / 2 + 0.4, 0.32]}>
        <planeGeometry args={[WIN_W, 0.8]} />
        <meshBasicMaterial map={botShade} transparent depthWrite={false} />
      </mesh>

      {/* Стекло */}
      <mesh position={[0, 0, FRONT_Z - 0.05]}>
        <planeGeometry args={[WIN_W, WIN_H]} />
        <meshStandardMaterial color="#bfe9ff" transparent opacity={0.05} roughness={0.05} metalness={0.9} depthWrite={false} />
      </mesh>

      <FrontDisplays />

      {/* Тумба */}
      <RoundedBox args={[OUTER_W(), BASE_H, DEPTH + 0.3]} radius={0.1} position={[0, -WIN_H / 2 - BOT_H - BASE_H / 2, BODY_Z + 0.15]}>
        <meshStandardMaterial color={BODY_DARK} metalness={0.3} roughness={0.5} />
      </RoundedBox>
      {/* Неоновая полоса и лоток для «монет» */}
      <mesh position={[0, -WIN_H / 2 - BOT_H - 0.6, FRONT_Z + 0.31]}>
        <boxGeometry args={[OUTER_W() - 0.5, 0.05, 0.02]} />
        <meshStandardMaterial color="#3ff6ff" emissive="#3ff6ff" emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
      <group position={[0, -WIN_H / 2 - BOT_H - 1.12, FRONT_Z + 0.3]}>
        <RoundedBox args={[2.6, 0.6, 0.3]} radius={0.08}>
          {goldMat}
        </RoundedBox>
        <mesh position={[0, 0, 0.16]}>
          <planeGeometry args={[2.3, 0.38]} />
          <meshStandardMaterial color="#07020d" roughness={0.9} />
        </mesh>
      </group>
      <mesh position={[0, -WIN_H / 2 - BOT_H - BASE_H + 0.1, FRONT_Z + 0.31]}>
        <boxGeometry args={[OUTER_W() - 0.5, 0.05, 0.02]} />
        <meshStandardMaterial color="#ff3fd8" emissive="#ff3fd8" emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Табло на полосе под окном: сообщения слева, линии и ставка справа. */
const INFO_W = 2.3
const OPEN_W = 1.35
const DISPLAY_H = BOT_H - 0.16
const MSG_W = () => WIN_W - INFO_W - OPEN_W - 0.24

function FrontDisplays() {
  const layoutVersion = useLayoutVersion()
  const message = useGame((s) => s.message)
  const phase = useGame((s) => s.phase)
  const auto = useGame((s) => s.auto)
  const lineCount = useGame((s) => s.lines.length)
  const cost = useGame((s) => s.cost)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const msg = useMemo(() => makeMessageDisplay(Math.round((MSG_W() / DISPLAY_H) * 120), 120), [layoutVersion])
  const info = useMemo(() => makeLinesDisplay(Math.round((INFO_W / DISPLAY_H) * 120), 120), [])
  useEffect(() => msg.draw(message, phase), [msg, message, phase])
  useEffect(() => info.draw(lineCount, cost, auto), [info, lineCount, cost, auto])
  const y = -WIN_H / 2 - BOT_H / 2
  return (
    <group position={[0, y, FRONT_Z + 0.012]}>
      <mesh position={[-WIN_W / 2 + MSG_W() / 2, 0, 0]}>
        <planeGeometry args={[MSG_W(), DISPLAY_H]} />
        <meshBasicMaterial map={msg.tex} transparent toneMapped={false} />
      </mesh>
      <OpenButton x={-WIN_W / 2 + MSG_W() + 0.12 + OPEN_W / 2} />
      <mesh position={[WIN_W / 2 - INFO_W / 2, 0, 0]}>
        <planeGeometry args={[INFO_W, DISPLAY_H]} />
        <meshBasicMaterial map={info.tex} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Кнопка «Открыть» у табло: мигает, когда выпал кандидат, открывает его карточку. */
function OpenButton({ x }: { x: number }) {
  const openWin = useGame((s) => s.openWin)
  const face = useRef<THREE.MeshStandardMaterial>(null!)
  const group = useRef<THREE.Group>(null!)
  const pressed = useRef(0)
  const hover = useHoverCursor()
  const label = useMemo(() => wideLabelTexture('OPEN'), [])
  const col = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }, dt) => {
    const { phase, winOpen } = useGame.getState()
    const ready = phase === 'win' && !winOpen
    pressed.current = Math.max(0, pressed.current - dt * 6)
    group.current.position.z = 0.05 - pressed.current * 0.04
    col.set(ready ? '#ffcf4a' : phase === 'win' ? '#e6dfd0' : '#6d6479')
    face.current.color.lerp(col, 1 - Math.exp(-dt * 12))
    face.current.emissive.copy(face.current.color)
    face.current.emissiveIntensity = ready ? 0.5 + Math.max(0, Math.sin(clock.elapsedTime * 7)) * 0.6 : 0.05
  })
  return (
    <group
      ref={group}
      position={[x, 0, 0.05]}
      onClick={(e) => {
        e.stopPropagation()
        pressed.current = 1
        sfx.click()
        openWin()
      }}
      {...hover}
    >
      <RoundedBox args={[OPEN_W, DISPLAY_H, 0.1]} radius={0.04}>
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[OPEN_W - 0.08, DISPLAY_H - 0.08]} />
        <meshStandardMaterial ref={face} color="#6d6479" roughness={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.056]}>
        <planeGeometry args={[Math.min(OPEN_W - 0.12, (DISPLAY_H - 0.1) * 3), Math.min(DISPLAY_H - 0.1, (OPEN_W - 0.12) / 3)]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

// ---------- Линии выплат ----------

const LINE_Z = 0.06
const UP = new THREE.Vector3(0, 1, 0)
/** Сколько линии видны после смены их числа, с. */
const FLASH_S = 2.2

function Segment({ a, b, color, register }: { a: THREE.Vector3; b: THREE.Vector3; color: string; register: (m: THREE.Mesh | null) => void }) {
  const { pos, quat, len } = useMemo(() => {
    const d = b.clone().sub(a)
    return {
      pos: a.clone().add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()),
      len: d.length(),
    }
  }, [a, b])
  return (
    <mesh ref={register} position={pos} quaternion={quat} visible={false} renderOrder={5}>
      <cylinderGeometry args={[0.014, 0.014, len + 0.028, 8]} />
      {/* Линии всегда поверх плиток (в том числе «выпрыгнувших» вперёд) — без проверки глубины. */}
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
  )
}

/** Высоты табличек: у каждого ряда своя полоса, таблички линий, начинающихся в ряду, делят её поровну. */
function tagLayout(lines: Payline[], side: 0 | 4) {
  const byRow = new Map<number, Payline[]>()
  for (const l of lines) byRow.set(l.rows[side], [...(byRow.get(l.rows[side]) ?? []), l])
  const maxInRow = Math.max(1, ...[...byRow.values()].map((g) => g.length))
  const h = Math.min(0.24, ROW_H / maxInRow - 0.02)
  const y = new Map<number, number>()
  for (const [row, group] of byRow) {
    const sorted = [...group].sort((a, b) => a.id - b.id)
    const step = ROW_H / sorted.length
    sorted.forEach((l, j) => y.set(l.id, rowY(row) + ROW_H / 2 - (j + 0.5) * step))
  }
  return { y, h }
}

/**
 * Линии как в автоматах: по краям окна — таблички с номерами активных линий; сами линии
 * показываются ненадолго при смене их числа, при наведении на табличку и при выигрыше
 * (только линии выигравшего комбо). В остальное время барабаны ничем не перекрыты.
 */
function Paylines() {
  const layoutVersion = useLayoutVersion()
  const lines = useGame((s) => s.lines)
  const hovered = useRef<number | null>(null)
  const segMeshes = useRef<{ mesh: THREE.Mesh; line: number }[]>([])
  const tagMats = useRef<{ m: THREE.MeshBasicMaterial; line: number }[]>([])
  segMeshes.current = []
  tagMats.current = []
  const regSeg = (line: number) => (mesh: THREE.Mesh | null) => {
    if (mesh) segMeshes.current.push({ mesh, line })
  }
  const regTag = (line: number) => (m: THREE.MeshBasicMaterial | null) => {
    if (m) tagMats.current.push({ m, line })
  }

  const { segments, tags } = useMemo(() => {
    const left = tagLayout(lines, 0)
    const right = tagLayout(lines, 4)
    const edge = WIN_W / 2
    const segments: {
      a: THREE.Vector3
      b: THREE.Vector3
      color: string
      line: number
      key: string
    }[] = []
    const tags: {
      id: number
      color: string
      x: number
      y: number
      h: number
      key: string
    }[] = []
    for (const l of lines) {
      const yl = left.y.get(l.id)!
      const yr = right.y.get(l.id)!
      const pts = [
        new THREE.Vector3(-edge, yl, LINE_Z),
        ...l.rows.map((row, i) => new THREE.Vector3(reelX(i), rowY(row), LINE_Z)),
        new THREE.Vector3(edge, yr, LINE_Z),
      ]
      for (let i = 0; i < pts.length - 1; i++)
        segments.push({
          a: pts[i],
          b: pts[i + 1],
          color: l.color,
          line: l.id,
          key: `${l.id}-${i}`,
        })
      tags.push({
        id: l.id,
        color: l.color,
        x: -edge - 0.28,
        y: yl,
        h: left.h,
        key: `L${l.id}`,
      })
      tags.push({
        id: l.id,
        color: l.color,
        x: edge + 0.28,
        y: yr,
        h: right.h,
        key: `R${l.id}`,
      })
    }
    return { segments, tags }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, layoutVersion])

  useFrame(({ clock }, dt) => {
    // Сглаживание по времени, а не по кадрам — одинаково при любом FPS.
    const k = 1 - Math.exp(-dt * 14)
    const { phase, result, linesChangedAt } = useGame.getState()
    const t = clock.elapsedTime
    const since = (performance.now() - linesChangedAt) / 1000
    const flash = since < FLASH_S ? Math.min(1, (FLASH_S - since) / 0.5) : 0
    // Линии выигрыша остаются, пока не нажат следующий запуск (и после открытия/обмена кандидата),
    // но гаснут на время мини-игр (бонус, переговоры об оффере) — окно должно быть поверх линий.
    const hasWin = phase !== 'spinning' && phase !== 'bonus' && phase !== 'upgrade' && !!result?.winner
    const win = new Set(hasWin ? result!.winLines : [])
    const h = hovered.current
    const shown = (line: number) => {
      if (h !== null) return line === h ? 1 : 0
      if (phase === 'spinning') return 0
      if (flash > 0) return flash
      if (hasWin) return win.has(line) ? (phase === 'win' ? 0.75 + Math.sin(t * 9) * 0.25 : 0.85) : 0
      return 0
    }
    for (const { mesh, line } of segMeshes.current) {
      const m = mesh.material as THREE.MeshStandardMaterial
      const target = shown(line) * 0.9
      m.opacity = THREE.MathUtils.lerp(m.opacity, target, k)
      if (target === 0 && m.opacity < 0.05) m.opacity = 0
      mesh.visible = m.opacity > 0
    }
    for (const { m, line } of tagMats.current) {
      const s = shown(line)
      m.color.setScalar(0.55 + 0.45 * Math.max(s, h === null && !hasWin ? 0.6 : 0))
    }
  })

  return (
    <group>
      {segments.map((s) => (
        <Segment key={s.key} a={s.a} b={s.b} color={s.color} register={regSeg(s.line)} />
      ))}
      {tags.map((tg) => (
        <mesh
          key={tg.key}
          position={[tg.x, tg.y, FRONT_Z + 0.015]}
          onPointerOver={(e) => {
            e.stopPropagation()
            hovered.current = tg.id
          }}
          onPointerOut={() => {
            if (hovered.current === tg.id) hovered.current = null
          }}
        >
          <planeGeometry args={[tg.h * 1.5, tg.h]} />
          <meshBasicMaterial ref={regTag(tg.id)} map={lineTagTexture(tg.id, tg.color)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

const BULB_COLORS = ['#ff3fd8', '#ffd84a', '#3ff6ff']

/** Внутренние поля вывески: лампочки по краю, внутри — табло и название. */
const SIGN_PAD_X = 0.42
const SIGN_INNER_H = SIGN_H - 0.5
const SIGN_KEY_W = 0.74
/** Пикселей текстуры табло на единицу мира — чёткий текст на больших экранах. */
const DISPLAY_PPU = 320

/** Табло статистики слева на вывеске: источник данных, пул, подходящие, просмотренные, спины, находки. */
function StatsDisplay({ x, w }: { x: number; w: number }) {
  const db = useGame((s) => s.db)
  const pool = useGame((s) => s.poolInfo)
  const filter = useGame((s) => s.settings.filter)
  const source = useGame((s) => s.settings.source)
  const stats = useGame((s) => s.stats)
  const skillCount = useGame((s) => s.targets.length)
  const h = SIGN_INNER_H
  const disp = useMemo(() => makeStatsDisplay(Math.round(w * DISPLAY_PPU), Math.round(h * DISPLAY_PPU)), [w, h])
  useEffect(() => {
    const src = source !== 'all' ? (source === 'github' ? 'GITHUB' : 'JSON RESUME') : 'ALL SOURCES'
    const flt = filter.trim() ? ` · ${describeFilter(filter).toUpperCase()}` : ''
    const status =
      db.status === 'loading'
        ? 'LOADING DATABASE…'
        : db.status === 'demo'
          ? `DEMO CANDIDATES · ${skillCount} ${plural(skillCount, 'SKILL', 'SKILLS', 'SKILLS')}`
          : `${src}${flt} · ${skillCount} ${plural(skillCount, 'SKILL', 'SKILLS', 'SKILLS')}`
    const dot = db.status === 'loading' ? '#ffd84a' : db.status === 'demo' ? '#ff9f43' : '#5cff9a'
    disp.draw(status, dot, [
      { label: 'POOL', value: pool.total.toLocaleString('en-US') },
      { label: 'ELIGIBLE', value: pool.eligible.toLocaleString('en-US') },
      { label: 'SEEN', value: String(pool.seen) },
      { label: 'SPINS', value: String(stats.spins) },
      { label: 'FINDS', value: String(stats.wins) },
    ])
  }, [disp, db.status, pool, filter, source, stats.spins, stats.wins, skillCount])
  return (
    <mesh position={[x, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={disp.tex} transparent toneMapped={false} />
    </mesh>
  )
}

/** Табло кредитов справа на вывеске: число плавно докручивается; без кредитов — клик просит бюджет у HRD. */
function CreditsDisplay({ x, w }: { x: number; w: number }) {
  const h = SIGN_INNER_H
  const disp = useMemo(() => makeCreditsDisplay(Math.round(w * DISPLAY_PPU), Math.round(h * DISPLAY_PPU)), [w, h])
  const shown = useRef(useGame.getState().credits)
  const drawn = useRef('')
  const hover = useHoverCursor()
  useFrame(({ clock }, dt) => {
    const { credits, cost, phase } = useGame.getState()
    const broke = credits < cost && phase === 'idle'
    const d = credits - shown.current
    shown.current = Math.abs(d) < 1 ? credits : shown.current + d * (1 - Math.exp(-dt * 8))
    const value = Math.round(shown.current)
    const blink = broke && Math.floor(clock.elapsedTime * 2.5) % 2 === 0
    const key = `${value}|${broke}|${blink}`
    if (key === drawn.current) return
    drawn.current = key
    disp.draw(value, broke ? REFILL_AMOUNT : null, blink)
  })
  useEffect(() => {
    drawn.current = ''
  }, [disp])
  return (
    <mesh
      position={[x, 0, 0]}
      onClick={(e) => {
        const { credits, cost, phase, refill } = useGame.getState()
        if (!(credits < cost && phase === 'idle')) return
        e.stopPropagation()
        sfx.click()
        refill()
      }}
      {...hover}
    >
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={disp.tex} transparent toneMapped={false} />
    </mesh>
  )
}

/** Клавиша на вывеске (лицом к игроку): золотая рамка, светлая панель, значок. */
function SignKey({ x, w, h, label, onPress }: { x: number; w: number; h: number; label: THREE.Texture; onPress: () => void }) {
  const group = useRef<THREE.Group>(null!)
  const face = useRef<THREE.MeshStandardMaterial>(null!)
  const pressed = useRef(0)
  const over = useRef(false)
  const col = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    pressed.current = Math.max(0, pressed.current - dt * 6)
    group.current.position.z = 0.05 - pressed.current * 0.04
    col.set(over.current ? '#ffcf4a' : '#e6dfd0')
    face.current.color.lerp(col, 1 - Math.exp(-dt * 12))
    face.current.emissive.copy(face.current.color)
    face.current.emissiveIntensity = over.current ? 0.45 : 0.12
  })
  return (
    <group
      ref={group}
      position={[x, 0, 0.05]}
      onClick={(e) => {
        e.stopPropagation()
        pressed.current = 1
        sfx.click()
        onPress()
      }}
      onPointerOver={() => {
        over.current = true
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        over.current = false
        document.body.style.cursor = ''
      }}
    >
      <RoundedBox args={[w, h, 0.1]} radius={0.04}>
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0, 0.052]}>
        <planeGeometry args={[w - 0.08, h - 0.08]} />
        <meshStandardMaterial ref={face} color="#e6dfd0" roughness={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.056]}>
        <planeGeometry args={[Math.min(w - 0.12, (h - 0.12) * (256 / 280)), Math.min(h - 0.12, (w - 0.12) * (280 / 256))]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * Вывеска: лампочки по краю, по центру — название, слева — табло статистики,
 * справа — табло кредитов и клавиши шорт-листа и настроек (вместо отдельной верхней полосы).
 */
function Sign() {
  useLayoutVersion()
  const tex = useMemo(() => signTexture(), [])
  const shortlistCount = useGame((s) => s.shortlist.length)
  const W = OUTER_W() + 0.3
  const H = SIGN_H
  const inner = W - SIGN_PAD_X * 2
  const titleH = SIGN_INNER_H
  const titleW = Math.min(titleH * 4, inner * 0.3)
  const sideW = (inner - titleW) / 2 - 0.16
  const leftX = -W / 2 + SIGN_PAD_X + sideW / 2
  const rightStart = titleW / 2 + 0.16
  const creditsW = sideW - SIGN_KEY_W * 2 - 0.2
  const bulbs = useMemo(() => {
    const pts: [number, number][] = []
    const nx = Math.round(W / 0.62)
    const ny = 3
    for (let i = 0; i <= nx; i++) {
      const x = -W / 2 + 0.2 + (i * (W - 0.4)) / nx
      pts.push([x, H / 2 - 0.12])
    }
    for (let j = 1; j <= ny; j++) pts.push([W / 2 - 0.2, H / 2 - 0.12 - (j * (H - 0.24)) / (ny + 1)])
    for (let i = nx; i >= 0; i--) {
      const x = -W / 2 + 0.2 + (i * (W - 0.4)) / nx
      pts.push([x, -H / 2 + 0.12])
    }
    for (let j = ny; j >= 1; j--) pts.push([-W / 2 + 0.2, H / 2 - 0.12 - (j * (H - 0.24)) / (ny + 1)])
    return pts
  }, [W, H])
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([])

  useFrame(({ clock }) => {
    const { phase } = useGame.getState()
    const t = clock.elapsedTime
    const n = bulbs.length
    mats.current.forEach((m, i) => {
      if (!m) return
      let on: number
      if (phase === 'win') on = Math.sin(t * 18 + (i % 2) * Math.PI) > 0 ? 1 : 0.1
      else if (phase === 'spinning') on = (Math.floor(t * 22) - i) % 4 === 0 ? 1 : 0.15
      else on = 0.35 + 0.65 * Math.max(0, Math.sin(t * 3 - (i / n) * Math.PI * 4))
      m.emissiveIntensity = on * 3
    })
  })

  return (
    <group position={[0, WIN_H / 2 + TOP_H + H / 2 + 0.05, FRONT_Z - 0.35]}>
      <RoundedBox args={[W, H, 0.6]} radius={0.12}>
        <meshStandardMaterial color={BODY} metalness={0.35} roughness={0.38} />
      </RoundedBox>
      <group position={[0, 0, 0.305]}>
        <mesh>
          <planeGeometry args={[titleW, titleH]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        <StatsDisplay x={leftX} w={sideW} />
        <CreditsDisplay x={rightStart + creditsW / 2} w={creditsW} />
        <SignKey x={rightStart + creditsW + 0.1 + SIGN_KEY_W / 2} w={SIGN_KEY_W} h={SIGN_INNER_H} label={iconKeyTexture('star', 'SHORTLIST', shortlistCount)} onPress={openShortlist} />
        <SignKey x={rightStart + creditsW + 0.2 + SIGN_KEY_W * 1.5} w={SIGN_KEY_W} h={SIGN_INNER_H} label={iconKeyTexture('gear', 'SETTINGS')} onPress={openSettings} />
      </group>
      {bulbs.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.32]}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshStandardMaterial
            ref={(m) => {
              mats.current[i] = m
            }}
            color={BULB_COLORS[i % 3]}
            emissive={BULB_COLORS[i % 3]}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ---------- Панель управления ----------

/** Круглая кнопка как ЗАПУСК: золотое кольцо, красная светящаяся шляпка, знак сверху. */
function RoundButton({
  position,
  radius,
  sign,
  onPress,
  enabled,
  pulse = false,
}: {
  position: [number, number, number]
  radius: number
  sign?: '+' | '-'
  onPress: () => void
  enabled: () => boolean
  pulse?: boolean
}) {
  const group = useRef<THREE.Group>(null!)
  const cap = useRef<THREE.MeshStandardMaterial>(null!)
  const pressed = useRef(0)
  const spinId = useGame((s) => s.spinId)
  const hover = useHoverCursor()
  const r = radius
  useEffect(() => {
    if (pulse && spinId > 0) pressed.current = 1
  }, [pulse, spinId])
  useFrame(({ clock }, dt) => {
    pressed.current = Math.max(0, pressed.current - dt * 5)
    group.current.position.y = position[1] + 0.1 - pressed.current * r * 0.16
    const on = enabled()
    const t = clock.elapsedTime
    cap.current.emissiveIntensity = on ? (pulse ? 1.4 + Math.sin(t * 4) * 0.6 : 0.9 + Math.sin(t * 3 + position[0]) * 0.2) : pulse ? 0.3 : 0.05
    cap.current.color.set(on || pulse ? RED : '#5a3a48')
  })
  const glyphH = 0.03
  const glyphY = r * 0.24 + 0.1 + glyphH / 2
  const glyph = <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} />
  return (
    <group
      ref={group}
      position={[position[0], position[1] + 0.1, position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        pressed.current = 1
        sfx.click()
        onPress()
      }}
      {...hover}
    >
      <mesh>
        <cylinderGeometry args={[r * 0.91, r, r * 0.3, 40]} />
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, r * 0.24, 0]}>
        <cylinderGeometry args={[r * 0.74, r * 0.78, r * 0.26, 40]} />
        <meshStandardMaterial ref={cap} color={RED} emissive={RED} toneMapped={false} roughness={0.3} />
      </mesh>
      {sign && (
        <mesh position={[0, glyphY - 0.1, 0]}>
          <boxGeometry args={[r * 0.8, glyphH, r * 0.2]} />
          {glyph}
        </mesh>
      )}
      {sign === '+' && (
        <mesh position={[0, glyphY - 0.1, 0]}>
          <boxGeometry args={[r * 0.2, glyphH, r * 0.8]} />
          {glyph}
        </mesh>
      )}
    </group>
  )
}

type KeyState = 'on' | 'off' | 'disabled'
const KEY_FACE: Record<KeyState, { color: string; emissive: number }> = {
  on: { color: '#ffcf4a', emissive: 0.55 },
  off: { color: '#e6dfd0', emissive: 0.08 },
  disabled: { color: '#6d6479', emissive: 0 },
}

/** Прямоугольная клавиша как на панели автомата: подсвечивается, когда выбрана. */
function Key({
  position,
  w,
  d,
  title,
  sub,
  state,
  onPress,
  onColor,
}: {
  position: [number, number, number]
  w: number
  d: number
  title: string
  sub?: string
  state: () => KeyState
  onPress: () => void
  onColor?: string
}) {
  const group = useRef<THREE.Group>(null!)
  const face = useRef<THREE.MeshStandardMaterial>(null!)
  const pressed = useRef(0)
  const hover = useHoverCursor()
  const label = useMemo(() => keyLabelTexture(title, sub), [title, sub])
  const col = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }, dt) => {
    pressed.current = Math.max(0, pressed.current - dt * 6)
    const st = state()
    const f = KEY_FACE[st]
    group.current.position.y = position[1] + 0.1 - pressed.current * 0.04 - (st === 'on' ? 0.015 : 0)
    col.set(st === 'on' && onColor ? onColor : f.color)
    face.current.color.lerp(col, 1 - Math.exp(-dt * 12))
    face.current.emissive.copy(face.current.color)
    face.current.emissiveIntensity = st === 'on' ? f.emissive + Math.sin(clock.elapsedTime * 5) * 0.12 : f.emissive
  })
  return (
    <group
      ref={group}
      position={[position[0], position[1] + 0.1, position[2]]}
      onClick={(e) => {
        e.stopPropagation()
        pressed.current = 1
        sfx.click()
        onPress()
      }}
      {...hover}
    >
      <RoundedBox args={[w, 0.1, d]} radius={0.03}>
        <meshStandardMaterial color="#1a0b28" metalness={0.4} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.08, d - 0.08]} />
        <meshStandardMaterial ref={face} color={KEY_FACE.off.color} roughness={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.056, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.min(w - 0.1, (d - 0.1) * 1.6), Math.min(d - 0.1, (w - 0.1) / 1.6)]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

const lineWord = (n: number) => (n === 1 ? 'LINE' : 'LINES')

/** Раскладка панели: широкий экран — один ряд, портрет — два ряда крупных клавиш. */
function deckLayout(compact: boolean) {
  if (!compact)
    return {
      auto: { x: -OUTER_W() / 2 + 0.95, z: 0, w: 1.25, d: 0.64 },
      presets: LINE_PRESETS.map((_, i) => ({
        x: -2.8 + i * 0.82,
        z: 0,
        w: 0.72,
        d: 0.64,
      })),
      minus: { x: 1.45, z: 0, r: 0.3 },
      plus: { x: 2.3, z: 0, r: 0.3 },
      spin: { x: OUTER_W() / 2 - 1.15, z: 0, r: 0.46 },
    }
  return {
    auto: { x: -OUTER_W() / 2 + 2.1, z: 0.45, w: 3.6, d: 0.72 },
    presets: LINE_PRESETS.map((_, i) => ({
      x: -OUTER_W() / 2 + 0.75 + i * 1.22,
      z: -0.45,
      w: 1.08,
      d: 0.72,
    })),
    minus: { x: OUTER_W() / 2 - 2.35, z: -0.45, r: 0.42 },
    plus: { x: OUTER_W() / 2 - 0.9, z: -0.45, r: 0.42 },
    spin: { x: OUTER_W() / 2 - 1.8, z: 0.45, r: 0.62 },
  }
}

function ControlDeck() {
  useLayoutVersion()
  const aspect = useThree((s) => s.size.width / s.size.height)
  const compact = isCompact(aspect)
  const L = deckLayout(compact)
  const spin = useGame((s) => s.spin)
  const setLines = useGame((s) => s.setLines)
  const changeLines = useGame((s) => s.changeLines)
  const toggleAuto = useGame((s) => s.toggleAuto)
  const st = () => useGame.getState()
  const idleish = () => st().phase !== 'spinning'
  const D = deckDepth(compact)

  return (
    // Панель наклонена вокруг заднего края, чтобы не закрывать табло над ней.
    <group position={[0, DECK_Y() - 0.06, FRONT_Z + 0.08]} rotation={[deckTilt(compact), 0, 0]}>
      <group position={[0, 0, D / 2]}>
        <RoundedBox args={[OUTER_W(), 0.16, D]} radius={0.05}>
          <meshStandardMaterial color="#2c0f45" metalness={0.4} roughness={0.35} />
        </RoundedBox>

        <Key
          position={[L.auto.x, 0, L.auto.z]}
          w={L.auto.w}
          d={L.auto.d}
          title="AUTO"
          sub="SPIN"
          onColor="#5cff9a"
          state={() => (st().auto ? 'on' : 'off')}
          onPress={toggleAuto}
        />
        {LINE_PRESETS.map((n, i) => (
          <Key
            key={n}
            position={[L.presets[i].x, 0, L.presets[i].z]}
            w={L.presets[i].w}
            d={L.presets[i].d}
            title={String(n)}
            sub={lineWord(n)}
            state={() => {
              const s = st()
              if (s.lines.length === n) return 'on'
              return n < minLinesFor(s.targets.length) || !idleish() ? 'disabled' : 'off'
            }}
            onPress={() => setLines(n)}
          />
        ))}
        <RoundButton
          position={[L.minus.x, 0, L.minus.z]}
          radius={L.minus.r}
          sign="-"
          onPress={() => changeLines(-1)}
          enabled={() => idleish() && st().lines.length > minLinesFor(st().targets.length)}
        />
        <RoundButton
          position={[L.plus.x, 0, L.plus.z]}
          radius={L.plus.r}
          sign="+"
          onPress={() => changeLines(1)}
          enabled={() => idleish() && st().lines.length < MAX_LINES}
        />
        <RoundButton position={[L.spin.x, 0, L.spin.z]} radius={L.spin.r} pulse onPress={spin} enabled={() => st().phase !== 'spinning' && !st().auto} />
      </group>
    </group>
  )
}

function Lever() {
  useLayoutVersion()
  const arm = useRef<THREE.Group>(null!)
  const spin = useGame((s) => s.spin)
  const spinId = useGame((s) => s.spinId)
  const pull = useRef(-1)
  const hover = useHoverCursor()

  useEffect(() => {
    if (spinId > 0) {
      pull.current = 0
      sfx.lever()
    }
  }, [spinId])

  useFrame((_, dt) => {
    if (pull.current < 0) return
    pull.current += dt
    const p = pull.current
    // 0.18 c вниз, затем пружиной обратно
    const angle = p < 0.18 ? (p / 0.18) * 1.1 : 1.1 * Math.exp(-(p - 0.18) * 5) * Math.cos((p - 0.18) * 9)
    arm.current.rotation.x = angle
    if (p > 1.6) {
      pull.current = -1
      arm.current.rotation.x = 0
    }
  })

  return (
    <group position={[OUTER_W() / 2 + 0.2, -0.75, FRONT_Z - 1.0]}>
      <RoundedBox args={[0.34, 0.8, 0.8]} radius={0.06}>
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} />
      </RoundedBox>
      <group ref={arm} position={[0.3, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.2, 24]} />
          <meshStandardMaterial color="#9aa0b5" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.055, 0.07, 1.6, 16]} />
          <meshStandardMaterial color="#c7ccd9" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh
          position={[0, 1.68, 0]}
          onClick={(e) => {
            e.stopPropagation()
            spin()
          }}
          {...hover}
        >
          <sphereGeometry args={[0.26, 32, 32]} />
          <meshStandardMaterial color="#ff2d55" emissive="#ff2d55" emissiveIntensity={0.35} roughness={0.25} metalness={0.2} />
        </mesh>
      </group>
    </group>
  )
}

export function SlotMachine() {
  useLayoutVersion()
  return (
    <group>
      <Cabinet />
      {Array.from({ length: REELS }, (_, i) => (
        <Reel key={i} index={i} x={reelX(i)} />
      ))}
      <BonusBoard />
      <UpgradeWheel />
      <Paylines />
      <Sparks />
      <Sign />
      <ControlDeck />
      <Lever />
    </group>
  )
}

/** Правый край рычага относительно правого края корпуса (шар выступает за корпус). */
const LEVER_OUT = 0.42

/** Габариты автомата для камеры и пола — считаются от текущего размера окна. */
export const MACHINE = {
  get WIN_H() {
    return WIN_H
  },
  get WIN_W() {
    return WIN_W
  },
  get OUTER_W() {
    return OUTER_W()
  },
  FRONT_Z,
  /** Верх вывески. */
  get top() {
    return WIN_H / 2 + TOP_H + SIGN_H + 0.05
  },
  /** Низ тумбы (пол). */
  get bottom() {
    return -WIN_H / 2 - BOT_H - BASE_H
  },
  /** Нижний край панели с кнопками (с учётом наклона). */
  deckBottom: (aspect: number) => DECK_Y() - 0.2 - deckDepth(isCompact(aspect)) * Math.sin(deckTilt(isCompact(aspect))),
  /** Левый и правый край кадра: вывеска слева (она чуть шире корпуса), шар рычага справа. */
  get left() {
    return -OUTER_W() / 2 - 0.08
  },
  get right() {
    return OUTER_W() / 2 + LEVER_OUT
  },
  isCompact,
}

/**
 * Размер окна барабанов под соотношение сторон экрана: автомат (от вывески до панели,
 * от левого края корпуса до рычага) должен упираться в края кадра. Широкий экран —
 * клетки шире, узкий — выше. Возвращает [WIN_W, WIN_H].
 */
export function fitWindow(aspect: number): [number, number] {
  const kw = MACHINE.right - MACHINE.left - WIN_W
  const kh = MACHINE.top - MACHINE.deckBottom(aspect) - WIN_H
  const w0 = BASE_WIN_W
  const h0 = BASE_WIN_H
  if (aspect * (h0 + kh) >= w0 + kw) return [Math.min(w0 * 2.2, aspect * (h0 + kh) - kw), h0]
  return [w0, Math.min(h0 * 1.6, (w0 + kw) / aspect - kh)]
}
