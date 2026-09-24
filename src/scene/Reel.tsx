import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { acceptedTexture, dotTexture, frameTexture, glareTexture, haloTexture, ringTexture, skillTexture } from './textures'
import { sfx } from '../audio/sfx'
import type { SkillId } from '../game/types'
import { REEL_GAP, ROW_H, SYMBOL_H, SYMBOL_W, WIN_H } from './layout'
import { extrasFor } from '../game/fx'
import { flipAngle, flipStart, restPose, signaturePose, SNAKE_STEP, SPARKS_PERIOD, type TilePose } from './tileFx'
import { sparkBus } from './Sparks'
import { PAYLINES, REELS as REEL_COUNT, SCATTER, SCATTER_P } from '../game/outcome'

export const SYMBOLS_PER_REEL = 12
const N = SYMBOLS_PER_REEL

const mod = (a: number, n: number) => ((a % n) + n) % n

/** Когда (performance.now) остановился последний барабан — отсчёт переворотов золотых папок. */
let landedAt = 0
/** Цикл переворота папок при 3+: к «НАЙДЕНО» — пауза — обратно — пауза, с. */
const FLIP_PERIOD = 2.2
const FLIP_TURN = 0.4
const FLIP_STAGGER = 0.14

/** Угол золотой папки в цикле: 0 — лицом («МАТЧ»), π — обратной стороной («НАЙДЕНО»). */
function scatterFlip(tt: number): number {
  if (tt < 0) return 0
  const p = tt % FLIP_PERIOD
  const half = FLIP_PERIOD / 2
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)
  if (p < FLIP_TURN) return Math.PI * ease(p / FLIP_TURN)
  if (p < half) return Math.PI
  if (p < half + FLIP_TURN) return Math.PI + Math.PI * ease((p - half) / FLIP_TURN)
  return 0
}
/** Доля плашки навыка в текстуре плитки (460×248 из 512×300): по ней строятся рамка и огонёк. */
const BADGE_W = 460 / 512
const BADGE_H = 248 / 300

/** Всё, что выходит за окно, обрезается — лента символов «уезжает» под рамку. */
const CLIP = [new THREE.Plane(new THREE.Vector3(0, -1, 0), WIN_H / 2), new THREE.Plane(new THREE.Vector3(0, 1, 0), WIN_H / 2)]

/** Быстрый старт и мягкая остановка с лёгким «перелётом» — как у механического барабана. */
function easeOutBack(p: number) {
  const c1 = 0.9
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

interface Anim {
  from: number
  to: number
  start: number
  duration: number
  done: boolean
  lastTick: number
}

function randomStrip(pool: SkillId[]): SkillId[] {
  const src = pool.length ? pool : ['javascript']
  // Золотая папка мелькает на ленте с той же частотой, что и в клетках.
  return Array.from({ length: N }, () => (Math.random() < SCATTER_P ? SCATTER : src[Math.floor(Math.random() * src.length)]))
}

/**
 * Плоский барабан: вертикальная лента из 12 плиток, которая едет вниз.
 * `offset` — позиция ленты в плитках; плитка `round(offset)` стоит в среднем ряду,
 * `+1` — в верхнем, `−1` — в нижнем.
 */
export function Reel({ index, x }: { index: number; x: number }) {
  const meshes = useRef<(THREE.Group | null)[]>([])
  const materials = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  /** Слои-эффекты каждой плитки: блик, волна, рамка, огонёк. */
  const overlays = useRef<({ glare: THREE.Mesh; ring: THREE.Mesh; frame: THREE.Mesh; dot: THREE.Mesh; halo: THREE.Mesh } | null)[]>([])
  const glareTex = useMemo(() => Array.from({ length: N }, () => glareTexture().clone()), [])
  /** Какие события эффектов уже сработали в этом выигрыше (звук, искры, переворот). */
  const fired = useRef(new Set<string>())
  const offset = useRef(Math.floor(Math.random() * N))
  /** Сдвиг барабана вниз во время миниигры (барабаны «уезжают» под рамку). */
  const slide = useRef(0)
  const root = useRef<THREE.Group>(null!)
  const [symbols, setSymbols] = useState<SkillId[]>(() => randomStrip(useGame.getState().pool))
  const anim = useRef<Anim | null>(null)

  const spinId = useGame((s) => s.spinId)
  const phase = useGame((s) => s.phase)
  const result = useGame((s) => s.result)
  const reelStopped = useGame((s) => s.reelStopped)
  const targets = useGame((s) => s.targets)
  const lines = useGame((s) => s.lines)

  /** Активные ряды этого барабана (0 — верх, 1 — середина, 2 — низ). */
  const activeRows = useMemo(() => {
    const src = phase !== 'idle' && result ? result.cells.filter((c) => c.reel === index) : lines.map((l) => ({ reel: index, row: l.rows[index] }))
    return new Set(src.map((c) => c.row))
  }, [phase, result, lines, index])
  const targetSet = useMemo(() => new Set(targets), [targets])
  /** Выигрыш остаётся подсвеченным до следующего запуска — и после открытия/обмена кандидата. */
  const showWin = phase !== 'spinning' && !!result?.winner
  const matchedSet = useMemo(() => new Set(showWin && result ? result.matched : []), [showWin, result])
  /** Клетки этого барабана, через которые прошли совпадения. */
  const winRows = useMemo(() => new Set(showWin && result ? result.winCells.filter((c) => c.reel === index).map((c) => c.row) : []), [showWin, result, index])
  /** Порядок «змейки» по всем барабанам (слева направо) и цвет линии для рамки каждой клетки. */
  const winOrder = useMemo(() => {
    const cells = [...(result?.winCells ?? [])].sort((a, b) => a.reel - b.reel || a.row - b.row)
    const order = new Map<number, number>()
    const color = new Map<number, string>()
    cells.forEach((c, i) => {
      if (c.reel !== index) return
      order.set(c.row, i)
      const line = PAYLINES.find((l) => result!.winLines.includes(l.id) && l.rows[c.reel] === c.row)
      color.set(c.row, line?.color ?? '#ffd84a')
    })
    return { order, color, count: cells.length }
  }, [result, index])
  const skillFx = useGame((s) => s.skillFx)
  const fxOn = useGame((s) => s.settings.fx)

  useEffect(() => {
    fired.current.clear()
  }, [result])

  useEffect(() => {
    if (spinId === 0) return
    const { result: r, pool } = useGame.getState()
    if (!r) return
    const from = offset.current
    const cur = mod(Math.round(from), N)
    const target = mod(cur + N / 2, N)

    // Меняем только скрытые плитки: видимые (cur±2) остаются, пока лента не разгонится.
    setSymbols((prev) => {
      const fresh = randomStrip(pool)
      return prev.map((s, i) => {
        const d = Math.min(mod(i - cur, N), mod(cur - i, N))
        if (i === mod(target + 1, N)) return r.grid[0][index]
        if (i === target) return r.grid[1][index]
        if (i === mod(target - 1, N)) return r.grid[2][index]
        return d <= 2 ? s : fresh[i]
      })
    })

    const turns = 3 + index
    anim.current = {
      from,
      to: from + turns * N + mod(target - from, N),
      start: performance.now() + index * 60,
      duration: 1500 + index * 380,
      done: false,
      lastTick: Math.floor(from),
    }
  }, [spinId, index])

  useFrame((state, dt) => {
    const a = anim.current
    if (a && !a.done) {
      const p = Math.min(1, Math.max(0, (performance.now() - a.start) / a.duration))
      offset.current = a.from + (a.to - a.from) * easeOutBack(p)
      const tick = Math.floor(offset.current)
      if (tick !== a.lastTick && p > 0.55) sfx.tick(index)
      a.lastTick = tick
      if (p >= 1) {
        a.done = true
        offset.current = mod(a.to, N)
        sfx.stop(index)
        if (index === REEL_COUNT - 1) landedAt = performance.now()
        // Золотые папки: звонок с нарастающим тоном — по числу папок на уже остановленных барабанах.
        const g = useGame.getState().result?.grid
        if (g && g.some((row) => row[index] === SCATTER)) {
          let k = 0
          for (let r = 0; r < g.length; r++) for (let c = 0; c <= index; c++) if (g[r][c] === SCATTER) k++
          sfx.ding(Math.min(8, k + 2))
        }
        reelStopped(index)
      }
    }

    const t = state.clock.elapsedTime
    // Миниигра: барабаны уезжают вниз с небольшой задержкой слева направо, потом возвращаются.
    const reelState = useGame.getState()
    const away = reelState.phase === 'bonus' || reelState.phase === 'upgrade'
    const awayAt = reelState.phase === 'upgrade' ? reelState.upgradeAt : reelState.bonusAt
    const slideTo = away ? -WIN_H * 1.1 : 0
    const k = 1 - Math.exp(-dt * (away ? 5 : 7))
    if (!away || performance.now() - awayAt > index * 70) slide.current += (slideTo - slide.current) * k
    root.current.position.y = slide.current
    root.current.visible = slide.current > -WIN_H * 1.05

    const spinning = !!anim.current && !anim.current.done
    const center = mod(Math.round(offset.current), N)
    const { winAt, phase: ph, result: res } = useGame.getState()
    const tt = (performance.now() - winAt) / 1000
    const calm = ph !== 'win'
    const extras = extrasFor(res?.wins[0]?.matched.length ?? 0)
    // 3+ папок: все они переворачиваются по кругу (волной слева направо) до следующего спина.
    const allStopped = ph !== 'spinning' || useGame.getState().stoppedReels >= REEL_COUNT
    const scatterOrder = new Map<number, number>()
    if (res?.bonus && allStopped)
      [...res.scatters].sort((a, b) => a.reel - b.reel || a.row - b.row).forEach((c, i) => c.reel === index && scatterOrder.set(c.row, i))
    const flipT = (performance.now() - landedAt) / 1000
    const kCol = 1 - Math.exp(-dt * 9)

    meshes.current.forEach((g, i) => {
      if (!g) return
      // Раскладка ленты: плитка i на высоте (i − offset) рядов, с зацикливанием.
      const rel = mod(i - offset.current + N / 2, N) - N / 2
      g.visible = Math.abs(rel) < 2.6
      const off = mod(i - center, N)
      const row = off === 0 ? 1 : off === 1 ? 0 : off === N - 1 ? 2 : -1
      const sym = symbols[i]
      const isWin = showWin && !spinning && row >= 0 && winRows.has(row) && matchedSet.has(sym)
      const order = isWin ? (winOrder.order.get(row) ?? 0) : 0

      // Поза плитки: фирменная анимация навыка + доп. эффекты по силе выигрыша.
      let pose: TilePose = restPose()
      if (isWin) {
        const delay = extras.snake && fxOn ? order * SNAKE_STEP : 0
        const local = tt - delay
        if (fxOn) {
          pose = signaturePose(skillFx[sym] ?? 'pop', local, calm)
          if (extras.flip && !calm) pose.rotY = flipAngle(tt, order, winOrder.count)
        } else {
          pose.glow = 0.55 + 0.35 * Math.sin(t * 8)
        }
        if (local < 0) pose.glow = 0

        // Одноразовые события: звук вспышки, искры, переворот, конфетти.
        const key = (name: string) => `${name}:${row}:${sym}`
        if (fxOn && !calm) {
          if (local >= 0 && !fired.current.has(key('ding'))) {
            fired.current.add(key('ding'))
            if (extras.snake) sfx.ding(order)
          }
          if (skillFx[sym] === 'sparks' && local >= 0) {
            const cycle = Math.floor(local / SPARKS_PERIOD)
            if (!fired.current.has(key(`sp${cycle}`))) {
              fired.current.add(key(`sp${cycle}`))
              sparkBus.emit(x, rel * ROW_H, 0.25, winOrder.color.get(row) ?? '#ffd84a', cycle === 0 ? 18 : 8)
            }
          }
          if (extras.flip) {
            const fs = flipStart(order, winOrder.count)
            if (tt >= fs && !fired.current.has(key('flip'))) {
              fired.current.add(key('flip'))
              sfx.whoosh()
            }
            if (extras.confetti && tt >= fs + 0.55 && !fired.current.has(key('confetti'))) {
              fired.current.add(key('confetti'))
              sparkBus.emit(x, rel * ROW_H, 0.3, winOrder.color.get(row) ?? '#ffd84a', 22, 1.5)
            }
          }
        }
      } else if (showWin && !spinning && fxOn) {
        // Остальные плитки уходят на второй план.
        pose.sx = pose.sy = 0.94
        pose.z = -0.02
      }

      if (!spinning && sym === SCATTER && row >= 0 && scatterOrder.has(row)) {
        pose.rotY = scatterFlip(flipT - scatterOrder.get(row)! * FLIP_STAGGER)
        pose.z = Math.max(pose.z, 0.04 * Math.sin(pose.rotY))
      }

      g.position.set(0, rel * ROW_H + pose.y, pose.z)
      g.scale.set(pose.sx, pose.sy, 1)
      g.rotation.set(0, pose.rotY, pose.rotZ)

      // Слои-эффекты
      const ov = overlays.current[i]
      if (ov) {
        const glareMat = ov.glare.material as THREE.MeshBasicMaterial
        ov.glare.visible = pose.shine >= 0
        if (pose.shine >= 0) {
          // Полоса проходит от −30 % до 130 % ширины плитки (текстура вдвое шире, repeat.x = 0.5).
          glareTex[i].offset.x = 0.65 - 0.8 * pose.shine
          glareMat.opacity = 0.9
        }
        // Мягкое свечение под плашкой — вместо сильного emissive, который «выжигал» плитку в bloom.
        const haloMat = ov.halo.material as THREE.MeshBasicMaterial
        ov.halo.visible = isWin && pose.glow > 0.01
        if (ov.halo.visible) {
          haloMat.opacity = Math.min(0.85, pose.glow * 0.9)
          haloMat.color.set(winOrder.color.get(row) ?? '#ffd84a')
        }
        ov.ring.visible = pose.ring >= 0
        if (pose.ring >= 0) {
          const r = 0.7 + pose.ring * 0.9
          ov.ring.scale.set(r, r, 1)
          ;(ov.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - pose.ring)
          ;(ov.ring.material as THREE.MeshBasicMaterial).color.set(winOrder.color.get(row) ?? '#ffd84a')
        }
        const frameOn = isWin && fxOn && extras.frame && !calm && tt - order * SNAKE_STEP >= 0
        ov.frame.visible = ov.dot.visible = frameOn
        if (frameOn) {
          const c = winOrder.color.get(row) ?? '#ffd84a'
          ;(ov.frame.material as THREE.MeshBasicMaterial).color.set(c)
          ;(ov.dot.material as THREE.MeshBasicMaterial).color.set(c)
          // Огонёк бежит по периметру плитки.
          const W = SYMBOL_W * BADGE_W
          const H = SYMBOL_H * BADGE_H
          const per = 2 * (W + H)
          let d = ((tt * 1.3 + order * 0.37) % 1) * per
          let px: number
          let py: number
          if (d < W) [px, py] = [-W / 2 + d, H / 2]
          else if ((d -= W) < H) [px, py] = [W / 2, H / 2 - d]
          else if ((d -= H) < W) [px, py] = [W / 2 - d, -H / 2]
          else [px, py] = [-W / 2, -H / 2 + (d - W)]
          ov.dot.position.set(px, py, 0.02)
        }
      }
    })

    // Яркость: выбранные навыки в активных клетках — ярко, остальное приглушено;
    // при выигрыше горят совпавшие навыки в клетках, через которые прошли линии.
    materials.current.forEach((m, i) => {
      if (!m) return
      const off = mod(i - center, N)
      const row = off === 0 ? 1 : off === 1 ? 0 : off === N - 1 ? 2 : -1
      const active = row >= 0 && activeRows.has(row)
      const sym = symbols[i]
      const glowing = showWin && winRows.has(row) && matchedSet.has(sym)
      let c = 1
      if (showWin && !spinning) c = glowing ? 1 : 0.3
      else if (!spinning) c = !active ? 0.42 : targetSet.has(sym) ? 1 : 0.6
      // Золотая папка всегда яркая (она не зависит от линий); при 3+ — пульсирует.
      const scatterHot = !spinning && sym === SCATTER && row >= 0 && !!res?.bonus
      if (sym === SCATTER && !spinning) c = 1
      m.color.setScalar(THREE.MathUtils.lerp(m.color.r, c, kCol))
      if (!glowing || spinning) m.emissiveIntensity = scatterHot ? 0.12 + 0.12 * Math.sin(t * 9) : 0
    })
    // Свечение совпавших — из позы (ставим после цвета, чтобы учесть змейку).
    meshes.current.forEach((g, i) => {
      const m = materials.current[i]
      if (!g || !m) return
      const off = mod(i - center, N)
      const row = off === 0 ? 1 : off === 1 ? 0 : off === N - 1 ? 2 : -1
      if (!(showWin && !spinning && row >= 0 && winRows.has(row) && matchedSet.has(symbols[i]))) return
      const order = winOrder.order.get(row) ?? 0
      const local = tt - (extras.snake && fxOn ? order * SNAKE_STEP : 0)
      const glow = local < 0 ? 0 : fxOn ? signaturePose(skillFx[symbols[i]] ?? 'pop', local, calm).glow : 0.55 + 0.35 * Math.sin(t * 8)
      // Слабое собственное свечение: плашка ярче, но не уходит в пересвет.
      m.emissiveIntensity = glow * 0.22
    })
  })

  return (
    <group position={[x, 0, 0]} ref={root}>
      {/* Фон ленты */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[REEL_GAP - 0.06, WIN_H]} />
        <meshStandardMaterial color="#efe8da" roughness={0.9} clippingPlanes={CLIP} />
      </mesh>
      {symbols.map((sym, i) => {
        const tex = skillTexture(sym)
        return (
          <group
            key={i}
            ref={(g) => {
              meshes.current[i] = g
            }}
          >
            {/* Свечение-подложка — позади плитки */}
            <mesh position={[0, 0, -0.015]} visible={false} ref={(m) => m && ((overlays.current[i] ??= {} as never).halo = m)}>
              <planeGeometry args={[SYMBOL_W * 1.235, SYMBOL_H * 1.32]} />
              <meshBasicMaterial map={haloTexture()} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} clippingPlanes={CLIP} />
            </mesh>
            {/* Волна — позади плитки */}
            <mesh position={[0, 0, -0.01]} visible={false} ref={(m) => m && ((overlays.current[i] ??= {} as never).ring = m)}>
              <planeGeometry args={[SYMBOL_W * 1.1, SYMBOL_W * 1.1]} />
              <meshBasicMaterial map={ringTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} clippingPlanes={CLIP} />
            </mesh>
            <mesh>
              <planeGeometry args={[SYMBOL_W, SYMBOL_H]} />
              <meshStandardMaterial
                ref={(m) => {
                  materials.current[i] = m
                }}
                map={tex}
                emissiveMap={tex}
                emissive="#ffffff"
                emissiveIntensity={0}
                roughness={0.85}
                metalness={0}
                toneMapped={false}
                clippingPlanes={CLIP}
                side={THREE.DoubleSide}
                transparent
                alphaTest={0.02}
              />
            </mesh>
            {/* Обратная сторона золотой папки: «НАЙДЕНО» — видна, когда плитка перевёрнута */}
            {sym === SCATTER && (
              <mesh position={[0, 0, -0.004]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[SYMBOL_W, SYMBOL_H]} />
                <meshBasicMaterial map={acceptedTexture()} transparent alphaTest={0.02} toneMapped={false} clippingPlanes={CLIP} />
              </mesh>
            )}
            {/* Блик */}
            <mesh position={[0, 0, 0.005]} visible={false} ref={(m) => m && ((overlays.current[i] ??= {} as never).glare = m)}>
              <planeGeometry args={[SYMBOL_W, SYMBOL_H]} />
              <meshBasicMaterial map={glareTex[i]} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} clippingPlanes={CLIP} />
            </mesh>
            {/* Бегущая рамка и огонёк */}
            <mesh position={[0, 0, 0.01]} visible={false} ref={(m) => m && ((overlays.current[i] ??= {} as never).frame = m)}>
              <planeGeometry args={[SYMBOL_W * BADGE_W * (500 / 484), SYMBOL_H * BADGE_H * (288 / 272)]} />
              <meshBasicMaterial map={frameTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} clippingPlanes={CLIP} />
            </mesh>
            <mesh visible={false} ref={(m) => m && ((overlays.current[i] ??= {} as never).dot = m)}>
              <planeGeometry args={[0.2, 0.2]} />
              <meshBasicMaterial map={dotTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} clippingPlanes={CLIP} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
