import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { chancesFor, sectorAt, WHEEL_SPIN_MS, type UpgradeGame } from '../game/upgrade'
import { getSkill } from '../game/skills'
import type { SkillId } from '../game/types'
import {
  keyLabelTexture,
  skillChipTexture,
  WHEEL_WINDOW_H,
  WHEEL_WINDOW_W,
  wheelButtonTexture,
  wheelFaceTexture,
  wheelPanelTexture,
  wheelWindowTexture,
  type WheelWindowView,
} from './textures'
import { WHEEL } from '../copy'
import { CLIP, useLayoutVersion, WIN_H, WIN_W } from './layout'
import { sfx } from '../audio/sfx'
import { sparkBus } from './Sparks'
import { inPhase, MiniGameWindow } from './MiniGameWindow'

/**
 * Миниигра «Колесо торга» в окне барабанов: колесо с секторами «Подписал (конверт) / Торгуется /
 * Ушёл» по центру, над стрелкой — окошко с тем, что под стрелкой (конверт / респин / «ушёл»),
 * после победы — выигранные навыки. Табло цепочки слева, кнопки КРУТИТЬ / ЗАБРАТЬ справа.
 * Итог вращения решён в store заранее (upgrade.landAt) — колесо только красиво доезжает до этой
 * точки. При победе плашки новых навыков летят из окошка на табло.
 */
const TAU = Math.PI * 2
/** Минимум полных оборотов за вращение. */
const TURNS = 5
/** Анимация короче таймера store — после остановки остаётся пауза на «вздох». */
const SPIN_DUR = WHEEL_SPIN_MS / 1000 - 0.5
const BULBS = 20
const ENTER_DELAY = 0.1
/** Полёт плашки навыка на табло, с; следующая плашка стартует с задержкой FLY_STAGGER. */
const FLY_DUR = 0.75
const FLY_STAGGER = 0.12
const FLY_MAX = 8

const R = () => WIN_H * 0.36
const CY = () => -WIN_H * 0.075
/** Окошко над стрелкой. */
const BOX_H = () => WIN_H * 0.15
const BOX_W = () => BOX_H() * (WHEEL_WINDOW_W / WHEEL_WINDOW_H)
const BOX_Y = () => WIN_H / 2 - WIN_H * 0.015 - BOX_H() / 2
/** Боковые колонки (табло / кнопки) — по центру окна, независимо от колеса. */
const SIDE_Y = () => -WIN_H * 0.035
const SIDE = () => (WIN_W - 2 * R() * 1.08) / 2
const SIDE_X = () => R() * 1.08 + SIDE() / 2
const PANEL_W = () => Math.min(SIDE() - 0.3, WIN_H * 0.95)
const PANEL_H = () => PANEL_W() * (560 / 640)
const BTN_W = () => Math.min(SIDE() - 0.4, WIN_H * 0.8)
const BTN_H = () => BTN_W() * (208 / 512)
const CHIP_W = () => BOX_W() * 0.4
const CHIP_H = () => CHIP_W() * (96 / 320)

/** Плавное торможение: быстро стартует, долго дотягивает последние сектора. */
const ease = (t: number) => 1 - Math.pow(1 - t, 4)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Навыки, которые принесла последняя победа. */
const wonFresh = (g: UpgradeGame): SkillId[] => {
  if (!g.prevSkills) return []
  const had = new Set(g.prevSkills)
  return g.skills.filter((id) => !had.has(id))
}

interface Flight {
  game: number
  step: number
  t0: number
  skills: SkillId[]
  landed: number
}

export function UpgradeWheel() {
  useLayoutVersion()
  const upgrade = useGame((s) => s.upgrade)
  const spinWheel = useGame((s) => s.spinWheel)
  const takeUpgrade = useGame((s) => s.takeUpgrade)
  const wheel = useRef<THREE.Group>(null!)
  const pointer = useRef<THREE.Group>(null!)
  const box = useRef<THREE.Group>(null!)
  const boxMat = useRef<THREE.MeshBasicMaterial>(null!)
  const boxKey = useRef('')
  const boxKick = useRef(0)

  const bulbs = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const btns = useRef<(THREE.Group | null)[]>([])
  const chips = useRef<(THREE.Mesh | null)[]>([])
  const hovered = useRef(-1)
  const pulse = useRef(0)
  const kick = useRef(0)
  // game — номер партии: счётчик spins у каждой партии свой, и без сброса первое вращение новой
  // партии могло совпасть со старым значением — колесо стояло, а кнопки уже были серыми.
  const anim = useRef({ angle: 0, from: 0, to: 0, t0: -1, spins: 0, sector: -1, game: -1 })
  /** Полёт плашек после победы; пока он идёт, табло показывает навыки без новых. */
  const flight = useRef<Flight | null>(null)
  const [flying, setFlying] = useState(false)
  /** Последняя партия — держим, пока окно уезжает после окончания миниигры. */
  const last = useRef<UpgradeGame | null>(null)
  if (upgrade) last.current = upgrade
  const g = upgrade ?? last.current

  // Лицо колеса: на зелёных секторах — запечатанные конверты.
  const face = useMemo(() => (g ? wheelFaceTexture(g.sectors) : null), [g?.sectors])
  useEffect(() => () => face?.dispose(), [face])

  const odds = g ? Math.round(chancesFor(g.grade).win) : 0
  // На табло — совпавшие навыки держателя, а не имя: ставка делается на набор навыков, не на человека.
  // У исходной карточки это навыки, сложившиеся на линиях (их число = звёзды), а не все навыки кандидата.
  // Пока плашки летят, новых навыков на табло ещё нет — они появляются по прилёту.
  const skills = useMemo(() => {
    if (!g) return []
    const before = new Set(g.prevSkills ?? [])
    const all = g.skills.map((id) => ({ id, fresh: !!g.prevSkills && !before.has(id) }))
    return flying ? all.filter((s) => !s.fresh) : all
  }, [g?.skills, g?.prevSkills, flying])
  const poolMax = useGame((s) => s.poolMax)
  const unicorn = !!g && g.grade >= poolMax
  const panelKey = g ? JSON.stringify([skills, g.grade, g.path, g.nextGrade, odds, g.status, g.last, unicorn]) : ''
  const panel = useMemo(
    () => (g ? wheelPanelTexture({ skills, grade: g.grade, path: g.path, nextGrade: g.nextGrade, odds, status: g.status, last: g.last, unicorn }) : null),
    [panelKey],
  )
  useEffect(() => () => panel?.dispose(), [panel])

  const hub = g ? keyLabelTexture(`${g.grade}★`) : null
  const canSpin = g?.status === 'ready'
  const canTake = g?.status === 'max' || (g?.status === 'ready' && g.step > 0)
  const canBack = g?.status === 'ready' && g.step === 0
  const spinTex =
    g?.status === 'max'
      ? wheelButtonTexture(WHEEL.maxBtn, WHEEL.maxBtnSub, 'off')
      : wheelButtonTexture(WHEEL.spinBtn, g ? `${g.grade}★ → ${g.nextGrade ?? '?'}★ · ${odds}%` : '', canSpin ? 'spin' : 'off')
  const takeTex = canBack
    ? wheelButtonTexture(WHEEL.backBtn, g ? WHEEL.keep(g.grade) : '', 'take')
    : wheelButtonTexture(WHEEL.takeBtn, g ? WHEEL.sign(g.grade) : '', canTake ? 'take' : 'off')

  // Звук и искры: вход, старт вращения, исход. На победе — запуск полёта плашек.
  const prev = useRef<UpgradeGame | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = upgrade
    if (!upgrade) return
    if (!p || p.id !== upgrade.id) {
      flight.current = null
      setFlying(false)
      sfx.wheelOpen()
      return
    }
    if (upgrade.status === 'spinning' && p.status !== 'spinning') {
      sfx.lever()
      return
    }
    if (p.status !== 'spinning' || upgrade.status === 'spinning') return
    const top = BOX_Y() - BOX_H() / 2
    if (upgrade.last === 'win') {
      pulse.current = 1
      sfx.wheelWin(upgrade.step)
      sparkBus.emit(0, top, 0.5, '#5cff9a', upgrade.status === 'max' ? 40 : 24, 1.4)
      if (upgrade.status === 'max') setTimeout(() => sparkBus.emit(0, CY(), 0.5, '#ffd84a', 40, 1.8), 250)
      const won = wonFresh(upgrade).slice(0, FLY_MAX)
      if (won.length) {
        flight.current = { game: upgrade.id, step: upgrade.step, t0: performance.now() / 1000, skills: won, landed: 0 }
        setFlying(true)
      }
    } else if (upgrade.last === 'push') {
      sfx.wheelRespin()
      sparkBus.emit(0, top, 0.5, '#ffd84a', 12)
    } else {
      sfx.wheelLose()
      sparkBus.emit(0, top, 0.5, '#ff5a6a', 16)
    }
  }, [upgrade])

  useFrame((state, dt) => {
    if (!g) return
    const t = state.clock.elapsedTime
    const a = anim.current
    // Новая партия — счётчик вращений с нуля, недокрученная анимация прошлой партии не продолжается.
    if (a.game !== g.id) {
      a.game = g.id
      a.spins = 0
      a.t0 = -1
    }

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
    const under = sectorAt(g.sectors, u)
    const sector = g.sectors.indexOf(under)
    if (sector !== a.sector) {
      if (a.t0 >= 0) {
        kick.current = 1
        sfx.tick(sector % 5)
      }
      a.sector = sector
    }
    kick.current *= Math.exp(-dt * 12)
    pointer.current.rotation.z = -kick.current * 0.45

    // Окошко над стрелкой. Во время вращения — сектор под стрелкой (мелькает, как в телешоу):
    // конверт / респин / «ушёл»; в ожидании — конверт (на что играем); после жёлтого — респин;
    // во время полёта и на потолке — только что выигранные навыки; после проигрыша — «ушёл».
    const f = flight.current
    let view: WheelWindowView
    if (f && f.game === g.id) view = { kind: 'won', skills: f.skills }
    else if (g.status === 'max') view = { kind: 'won', skills: wonFresh(g) }
    else if (g.status === 'lost') view = { kind: 'lose' }
    else if (g.status === 'ready') view = { kind: g.last === 'push' ? 'push' : 'envelope' }
    else view = { kind: under.kind === 'win' ? 'envelope' : under.kind }
    const vKey = view.kind === 'won' ? `${view.kind}|${view.skills.join()}` : view.kind
    if (vKey !== boxKey.current) {
      boxKey.current = vKey
      boxMat.current.map = wheelWindowTexture(view)
      boxMat.current.needsUpdate = true
      boxKick.current = a.t0 >= 0 ? 0.5 : 1
    }
    boxKick.current *= Math.exp(-dt * 10)
    box.current.scale.setScalar(1 + boxKick.current * 0.05)

    // Полёт плашек навыков из окошка на табло.
    const now = performance.now() / 1000
    const toX = -SIDE_X()
    const toY = SIDE_Y() + PANEL_H() * 0.2
    chips.current.forEach((m, i) => {
      if (!m) return
      if (!f || f.game !== g.id || i >= f.skills.length) {
        m.visible = false
        return
      }
      const lt = now - f.t0 - i * FLY_STAGGER
      const p = Math.min(1, Math.max(0, lt / FLY_DUR))
      m.visible = lt >= 0 && p < 1
      const mat = m.material as THREE.MeshBasicMaterial
      if (mat.map !== skillChipTexture(f.skills[i])) {
        mat.map = skillChipTexture(f.skills[i])
        mat.needsUpdate = true
      }
      const n = f.skills.length
      const fromX = (i - (n - 1) / 2) * CHIP_W() * 0.9
      const fromY = BOX_Y()
      const e = easeInOut(p)
      // Дуга: вверх-влево и вниз на табло.
      const x = THREE.MathUtils.lerp(fromX, toX, e)
      const y = THREE.MathUtils.lerp(fromY, toY, e) + Math.sin(p * Math.PI) * WIN_H * 0.12
      m.position.set(x, y, 0.3)
      m.rotation.z = Math.sin(p * Math.PI) * 0.35
      m.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.25 - p * 0.25)
      if (lt >= FLY_DUR && f.landed <= i) {
        f.landed = i + 1
        sfx.chipLanded(i)
        sparkBus.emit(toX, toY, 0.5, getSkill(f.skills[i]).color, 14, 1.1)
        if (f.landed >= n) {
          // Все долетели — табло показывает новые навыки с «+».
          flight.current = null
          setFlying(false)
          sparkBus.emit(toX, toY, 0.5, '#5cff9a', 20, 1.3)
        }
      }
    })

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
      if (!inPhase('upgrade')) return
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
    // Сукно — отдельный фиолетовый «студийный» тон, не стол бонуса.
    <MiniGameWindow phase="upgrade" startedAt={(s) => s.upgradeAt} enterDelay={ENTER_DELAY} hasContent={!!g} cloth="#1a0c33">
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

      {/* Окошко над стрелкой: что под стрелкой (конверт / респин / «ушёл»), после победы — навыки. */}
      <group ref={box} position={[0, BOX_Y(), 0.12]}>
        <mesh>
          <planeGeometry args={[BOX_W(), BOX_H()]} />
          <meshBasicMaterial ref={boxMat} {...mat} />
        </mesh>
      </group>

      {/* Плашки, летящие на табло после победы. */}
      {Array.from({ length: FLY_MAX }, (_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(m) => {
            chips.current[i] = m
          }}
        >
          <planeGeometry args={[CHIP_W(), CHIP_H()]} />
          <meshBasicMaterial transparent alphaTest={0.02} toneMapped={false} clippingPlanes={CLIP} />
        </mesh>
      ))}

      {/* Табло цепочки. */}
      <mesh position={[-SIDE_X(), SIDE_Y(), 0.1]}>
        <planeGeometry args={[PANEL_W(), PANEL_H()]} />
        <meshBasicMaterial map={panel} {...mat} />
      </mesh>

      {/* Кнопки: КРУТИТЬ и ЗАБРАТЬ / НАЗАД. */}
      {[
        { tex: spinTex, y: SIDE_Y() + BTN_H() * 0.7, act: () => canSpin && spinWheel() },
        { tex: takeTex, y: SIDE_Y() - BTN_H() * 0.7, act: () => (canTake || canBack) && takeUpgrade() },
      ].map((b, i) => (
        <group
          key={i}
          position={[SIDE_X(), b.y, 0.1]}
          ref={(o) => {
            btns.current[i] = o
          }}
          onClick={(e) => {
            if (!inPhase('upgrade')) return
            e.stopPropagation()
            sfx.button()
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
    </MiniGameWindow>
  )
}
