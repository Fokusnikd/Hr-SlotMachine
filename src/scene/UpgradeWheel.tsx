import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { chancesFor, sectorAt, WHEEL_SPIN_MS, type UpgradeGame } from '../game/upgrade'
import { keyLabelTexture, wheelButtonTexture, wheelFaceTexture, wheelPanelTexture } from './textures'
import { CLIP, useLayoutVersion, WIN_H, WIN_W } from './layout'
import { sfx } from '../audio/sfx'
import { sparkBus } from './Sparks'
import type { Candidate } from '../game/types'

/**
 * Миниигра «Колесо торга» в окне барабанов: колесо с секторами «Подписал / Торгуется / Ушёл»
 * по центру, табло цепочки слева, кнопки КРУТИТЬ / ЗАБРАТЬ справа. Итог вращения решён в store
 * заранее (upgrade.landAt) — колесо только красиво доезжает до этой точки.
 */
const TAU = Math.PI * 2
/** Минимум полных оборотов за вращение. */
const TURNS = 5
/** Анимация короче таймера store — после остановки остаётся пауза на «вздох». */
const SPIN_DUR = WHEEL_SPIN_MS / 1000 - 0.5
const BULBS = 20
const ENTER_DELAY = 0.1

const R = () => WIN_H * 0.42
const CY = () => -WIN_H * 0.035
/** Ширина боковой колонки (табло / кнопки). */
const SIDE = () => (WIN_W - 2 * R() * 1.08) / 2
const SIDE_X = () => R() * 1.08 + SIDE() / 2
const PANEL_W = () => Math.min(SIDE() - 0.3, WIN_H * 0.95)
const PANEL_H = () => PANEL_W() * (560 / 640)
const BTN_W = () => Math.min(SIDE() - 0.4, WIN_H * 0.8)
const BTN_H = () => BTN_W() * (208 / 512)

/** Плавное торможение: быстро стартует, долго дотягивает последние сектора. */
const ease = (t: number) => 1 - Math.pow(1 - t, 4)

export function UpgradeWheel() {
  useLayoutVersion()
  const upgrade = useGame((s) => s.upgrade)
  const spinWheel = useGame((s) => s.spinWheel)
  const takeUpgrade = useGame((s) => s.takeUpgrade)
  const root = useRef<THREE.Group>(null!)
  const wheel = useRef<THREE.Group>(null!)
  const pointer = useRef<THREE.Group>(null!)
  const bulbs = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const btns = useRef<(THREE.Group | null)[]>([])
  const hovered = useRef(-1)
  const appear = useRef(0)
  const pulse = useRef(0)
  const kick = useRef(0)
  const anim = useRef({ angle: 0, from: 0, to: 0, t0: -1, spins: 0, sector: -1 })
  /** Последняя партия — держим, пока окно уезжает после окончания миниигры. */
  const last = useRef<UpgradeGame | null>(null)
  if (upgrade) last.current = upgrade
  const g = upgrade ?? last.current

  const face = useMemo(() => (g ? wheelFaceTexture(g.sectors) : null), [g?.sectors])
  useEffect(() => () => face?.dispose(), [face])

  const odds = g ? Math.round(chancesFor(g.grade).win) : 0
  // На табло — совпавшие навыки держателя, а не имя: ставка делается на набор навыков, не на человека.
  const targets = useGame((s) => s.targets)
  const skills = useMemo(() => {
    if (!g) return []
    const t = new Set(targets)
    const matched = (c: Candidate) => [...new Set(c.skills.filter((sk) => t.has(sk)))]
    const before = new Set(g.prev ? matched(g.prev) : [])
    return matched(g.holder).map((id) => ({ id, fresh: !!g.prev && !before.has(id) }))
  }, [g?.holder, g?.prev, targets])
  const panelKey = g ? JSON.stringify([skills, g.grade, g.path, g.nextGrade, odds, g.status, g.last]) : ''
  const panel = useMemo(
    () => (g ? wheelPanelTexture({ skills, grade: g.grade, path: g.path, nextGrade: g.nextGrade, odds, status: g.status, last: g.last }) : null),
    [panelKey],
  )
  useEffect(() => () => panel?.dispose(), [panel])

  const hub = g ? keyLabelTexture(`${g.grade}★`) : null
  const canSpin = g?.status === 'ready'
  const canTake = g?.status === 'max' || (g?.status === 'ready' && g.step > 0)
  const canBack = g?.status === 'ready' && g.step === 0
  const spinTex =
    g?.status === 'max'
      ? wheelButtonTexture('★ MAX', 'nobody stronger', 'off')
      : wheelButtonTexture('SPIN', g ? `${g.grade}★ → ${g.nextGrade ?? '?'}★ · ${odds}%` : '', canSpin ? 'spin' : 'off')
  const takeTex = canBack
    ? wheelButtonTexture('BACK', g ? `keep ×${g.grade}` : '', 'take')
    : wheelButtonTexture('TAKE', g ? `sign ×${g.grade}` : '', canTake ? 'take' : 'off')

  // Звук и искры: вход, старт вращения, исход.
  const prev = useRef<UpgradeGame | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = upgrade
    if (!upgrade) return
    if (!p || p.originId !== upgrade.originId) {
      sfx.whoosh()
      return
    }
    if (upgrade.status === 'spinning' && p.status !== 'spinning') {
      sfx.lever()
      return
    }
    if (p.status !== 'spinning' || upgrade.status === 'spinning') return
    const top = CY() + R()
    if (upgrade.last === 'win') {
      pulse.current = 1
      sfx.win(upgrade.status === 'max' ? 'legendary' : 'rare')
      sparkBus.emit(0, top, 0.5, '#5cff9a', upgrade.status === 'max' ? 40 : 24, 1.4)
      if (upgrade.status === 'max') setTimeout(() => sparkBus.emit(0, CY(), 0.5, '#ffd84a', 40, 1.8), 250)
    } else if (upgrade.last === 'push') {
      sfx.ding(4)
      sparkBus.emit(0, top, 0.5, '#ffd84a', 12)
    } else {
      sfx.nearMiss()
      sparkBus.emit(0, top, 0.5, '#ff5a6a', 16)
    }
  }, [upgrade])

  useFrame((state, dt) => {
    const { phase, upgradeAt } = useGame.getState()
    const on = phase === 'upgrade' && (performance.now() - upgradeAt) / 1000 > ENTER_DELAY
    appear.current += ((on ? 1 : 0) - appear.current) * (1 - Math.exp(-dt * (on ? 6 : 8)))
    root.current.visible = appear.current > 0.01 && !!g
    root.current.position.y = (1 - appear.current) * WIN_H * 1.1
    if (!g) return
    const t = state.clock.elapsedTime
    const a = anim.current

    // Новое вращение: доводим колесо по часовой до точки landAt (под стрелкой — доля φ/2π).
    if (g.status === 'spinning' && g.landAt != null && g.spins !== a.spins) {
      a.spins = g.spins
      a.from = a.angle
      const target = g.landAt * TAU
      const k = Math.ceil((target - (a.from - TAU * TURNS)) / TAU)
      a.to = target - TAU * k
      a.t0 = t
    }
    if (a.t0 >= 0) {
      const p = Math.min(1, (t - a.t0) / SPIN_DUR)
      a.angle = a.from + (a.to - a.from) * ease(p)
      if (p >= 1) a.t0 = -1
    }
    wheel.current.rotation.z = a.angle

    // Щелчок стрелки на каждой границе сектора.
    const u = (((a.angle / TAU) % 1) + 1) % 1
    const sector = g.sectors.indexOf(sectorAt(g.sectors, u))
    if (sector !== a.sector) {
      if (a.t0 >= 0) {
        kick.current = 1
        sfx.tick(sector % 5)
      }
      a.sector = sector
    }
    kick.current *= Math.exp(-dt * 12)
    pointer.current.rotation.z = -kick.current * 0.45

    // Пульс колеса при перестройке под новый грейд.
    pulse.current *= Math.exp(-dt * 3)
    const sc = 1 + Math.sin(pulse.current * Math.PI) * 0.06
    wheel.current.scale.setScalar(sc)

    // Лампочки: бегущий огонь при вращении, спокойное мигание в ожидании, цвет исхода в конце.
    const spinning = g.status === 'spinning'
    bulbs.current.forEach((m, i) => {
      if (!m) return
      let on: number
      let color = '#fff2c4'
      if (spinning) on = (Math.floor(t * 18) - i) % 4 === 0 ? 1 : 0.25
      else if (g.status === 'lost') ((on = Math.sin(t * 10) > 0 ? 1 : 0.2), (color = '#ff5a6a'))
      else if (g.status === 'max' || (g.last === 'win' && pulse.current > 0.05)) ((on = (i + Math.floor(t * 8)) % 2 ? 1 : 0.35), (color = g.status === 'max' ? '#ffd84a' : '#5cff9a'))
      else on = (i + Math.floor(t * 2)) % 2 ? 0.9 : 0.4
      m.color.set(color).multiplyScalar(on)
    })

    // Кнопки: наведение.
    const kr = 1 - Math.exp(-dt * 10)
    btns.current.forEach((b, i) => {
      if (!b) return
      const active = i === 0 ? canSpin : canTake || canBack
      const s = active && hovered.current === i ? 1.07 : active ? 1 + Math.sin(t * 4 + i) * 0.015 : 0.96
      b.scale.x += (s - b.scale.x) * kr
      b.scale.y += (s - b.scale.y) * kr
    })
  })

  const hover = (i: number) => ({
    onPointerOver: (e: { stopPropagation: () => void }) => {
      if (useGame.getState().phase !== 'upgrade') return
      e.stopPropagation()
      hovered.current = i
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      if (hovered.current !== i) return
      hovered.current = -1
      document.body.style.cursor = ''
    },
  })

  const r = R()
  const mat = { transparent: true, alphaTest: 0.02, toneMapped: false, clippingPlanes: CLIP } as const
  return (
    <group ref={root} visible={false}>
      {/* Сукно — отдельный фиолетовый «студийный» тон, не зелёный стол бонуса. */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[WIN_W, WIN_H]} />
        <meshStandardMaterial color="#1a0c33" roughness={0.9} clippingPlanes={CLIP} />
      </mesh>
      {/* Прожектор за колесом. */}
      <mesh position={[0, CY(), 0.04]}>
        <circleGeometry args={[r * 1.35, 64]} />
        <meshBasicMaterial color="#6a3cc0" transparent opacity={0.25} toneMapped={false} clippingPlanes={CLIP} />
      </mesh>

      <group position={[0, CY(), 0.08]}>
        <group ref={wheel}>
          <mesh>
            <circleGeometry args={[r, 128]} />
            <meshStandardMaterial map={face} emissiveMap={face} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.6} {...mat} />
          </mesh>
        </group>
        {/* Обод с лампочками — не крутится. */}
        <mesh position={[0, 0, 0.01]}>
          <ringGeometry args={[r * 0.995, r * 1.08, 128]} />
          <meshStandardMaterial color="#e7b64a" metalness={0.7} roughness={0.3} emissive="#6a4a10" clippingPlanes={CLIP} />
        </mesh>
        {Array.from({ length: BULBS }, (_, i) => {
          const a = (i / BULBS) * TAU
          return (
            <mesh key={i} position={[Math.sin(a) * r * 1.037, Math.cos(a) * r * 1.037, 0.02]}>
              <circleGeometry args={[r * 0.026, 16]} />
              <meshBasicMaterial
                ref={(m) => {
                  bulbs.current[i] = m
                }}
                color="#fff2c4"
                toneMapped={false}
                clippingPlanes={CLIP}
              />
            </mesh>
          )
        })}
        {/* Ступица с текущим грейдом. */}
        <mesh position={[0, 0, 0.02]}>
          <circleGeometry args={[r * 0.2, 48]} />
          <meshStandardMaterial color="#e7b64a" metalness={0.6} roughness={0.35} emissive="#7a5410" clippingPlanes={CLIP} />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <planeGeometry args={[r * 0.34, r * 0.34 * (160 / 256)]} />
          <meshBasicMaterial map={hub} {...mat} />
        </mesh>
        {/* Стрелка сверху, качается на щелчках секторов. */}
        <group ref={pointer} position={[0, r * 1.1, 0.05]}>
          <mesh position={[0, -r * 0.06, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[r * 0.075, r * 0.2, 3]} />
            <meshStandardMaterial color="#ff4d6a" emissive="#7a0018" metalness={0.3} roughness={0.4} clippingPlanes={CLIP} />
          </mesh>
        </group>
      </group>

      {/* Табло цепочки. */}
      <mesh position={[-SIDE_X(), CY(), 0.1]}>
        <planeGeometry args={[PANEL_W(), PANEL_H()]} />
        <meshBasicMaterial map={panel} {...mat} />
      </mesh>

      {/* Кнопки: КРУТИТЬ и ЗАБРАТЬ / НАЗАД. */}
      {[
        { tex: spinTex, y: CY() + BTN_H() * 0.7, act: () => canSpin && spinWheel() },
        { tex: takeTex, y: CY() - BTN_H() * 0.7, act: () => (canTake || canBack) && takeUpgrade() },
      ].map((b, i) => (
        <group
          key={i}
          position={[SIDE_X(), b.y, 0.1]}
          ref={(o) => {
            btns.current[i] = o
          }}
          onClick={(e) => {
            if (useGame.getState().phase !== 'upgrade') return
            e.stopPropagation()
            sfx.click()
            b.act()
          }}
          {...hover(i)}
        >
          <mesh>
            <planeGeometry args={[BTN_W(), BTN_H()]} />
            <meshBasicMaterial map={b.tex} {...mat} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
