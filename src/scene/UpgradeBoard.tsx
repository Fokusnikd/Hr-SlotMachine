import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { CLOSED_COUNT, OFFERS, type UpgradeGame } from '../game/upgrade'
import { offerBackTexture, offerFrontTexture, keyLabelTexture } from './textures'
import { CLIP, ROW_H, useLayoutVersion, WIN_H, WIN_W } from './layout'
import { sfx } from '../audio/sfx'
import { sparkBus } from './Sparks'

/** Миниигра «Переговоры об оффере» (Hi-Lo) в окне барабанов: одна открытая папка — ожидания
 *  кандидата (текущий грейд), пять закрытых снизу. Игрок вскрывает одну; выше открытой — победа. */
const OPEN_Y = () => ROW_H * 0.72
const ROW_Y = () => -ROW_H * 0.55
const TILE_H = () => Math.min(ROW_H - 0.1, (WIN_W / (CLOSED_COUNT + 1) - 0.16) * (280 / 400))
const TILE_W = () => TILE_H() * (400 / 280)
const GAP = () => Math.min(WIN_W / CLOSED_COUNT, TILE_W() + 0.24)
/** Задержка появления после старта миниигры (пока уезжают барабаны), с. */
const ENTER_DELAY = 0.1

const closedX = (i: number) => (i - (CLOSED_COUNT - 1) / 2) * GAP()

export function UpgradeBoard() {
  // Размер окна меняется под экран — перерисовываемся вместе с ним.
  useLayoutVersion()
  const root = useRef<THREE.Group>(null!)
  const closedTiles = useRef<(THREE.Group | null)[]>([])
  const closedFaces = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  const openFace = useRef<THREE.MeshStandardMaterial | null>(null)
  const hovered = useRef(-1)
  /** Последняя партия — держим, пока сцена уезжает после окончания миниигры. */
  const last = useRef<UpgradeGame | null>(null)
  const flavor = useRef<number[]>([])
  const appear = useRef(0)
  const upgrade = useGame((s) => s.upgrade)
  const pickOffer = useGame((s) => s.pickOffer)
  if (upgrade) {
    if (last.current !== upgrade && (!last.current || last.current.candidateId !== upgrade.candidateId)) {
      flavor.current = Array.from({ length: CLOSED_COUNT }, () => Math.floor(Math.random() * 8))
    }
    last.current = upgrade
  }
  const shown = upgrade ?? last.current

  const backTex = useMemo(() => flavor.current.map((f) => offerBackTexture(f)), [shown?.candidateId])
  const openLabel = useMemo(() => keyLabelTexture('THEIR ASK', ''), [])

  // Звук и искры на вскрытие; фанфары/утешение на исход.
  const prev = useRef<UpgradeGame | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = upgrade
    if (!upgrade) return
    if (!p || p.candidateId !== upgrade.candidateId) {
      sfx.whoosh()
      return
    }
    if (upgrade.picked !== null && p.picked === null) {
      const i = upgrade.picked
      const color = upgrade.status === 'won' ? '#5cff9a' : upgrade.status === 'pushed' ? '#ffd84a' : '#ff5a6a'
      sfx.tick(i)
      setTimeout(() => {
        if (upgrade.status === 'won') sfx.win('rare')
        else if (upgrade.status === 'pushed') sfx.ding(3)
        else sfx.nearMiss()
        sparkBus.emit(closedX(i), ROW_Y(), 0.45, color, upgrade.status === 'won' ? 22 : 10)
      }, 260)
      if (upgrade.status === 'won') setTimeout(() => sfx.win('legendary'), 500)
      else if (upgrade.status === 'lost') setTimeout(() => sfx.coins(6), 500)
    }
  }, [upgrade])

  useFrame((state, dt) => {
    const g = shown
    const { phase, upgradeAt } = useGame.getState()
    const on = phase === 'upgrade' && (performance.now() - upgradeAt) / 1000 > ENTER_DELAY
    appear.current += ((on ? 1 : 0) - appear.current) * (1 - Math.exp(-dt * (on ? 6 : 8)))
    root.current.visible = appear.current > 0.01 && !!g
    root.current.position.y = (1 - appear.current) * WIN_H * 1.1
    if (!g) return
    const t = state.clock.elapsedTime
    const over = g.status !== 'play'
    const kr = 1 - Math.exp(-dt * 10)
    closedTiles.current.forEach((c, i) => {
      if (!c) return
      const flipped = g.picked === i
      const target = flipped ? Math.PI : 0
      c.rotation.y += (target - c.rotation.y) * kr
      const hover = !over && g.picked === null && hovered.current === i
      const win = flipped && g.status === 'won'
      const s = hover ? 1.08 : win ? 1.07 + Math.sin(t * 8) * 0.04 : over && !flipped ? 0.92 : 1
      c.scale.x += (s - c.scale.x) * kr
      c.scale.y += (s - c.scale.y) * kr
      c.position.z = hover ? 0.14 : win ? 0.12 : 0
      const face = closedFaces.current[i]
      if (face) {
        const dim = over && !flipped ? 0.4 : 1
        face.color.setScalar(THREE.MathUtils.lerp(face.color.r, dim, kr))
        face.emissiveIntensity = hover ? 0.28 : win ? 0.22 + Math.sin(t * 8) * 0.1 : 0.04
      }
    })
    if (openFace.current) openFace.current.emissiveIntensity = 0.08 + Math.sin(t * 2) * 0.02
  })

  return (
    <group ref={root} visible={false}>
      {/* Сукно — перед разделителями барабанов (они заканчиваются на z = 0). */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[WIN_W, WIN_H]} />
        <meshStandardMaterial color="#0c2a1e" roughness={0.95} clippingPlanes={CLIP} />
      </mesh>
      {/* Открытая папка — ожидания кандидата (текущий грейд). */}
      <group position={[0, OPEN_Y(), 0.1]}>
        <mesh position={[0, TILE_H() * 0.62, 0]}>
          <planeGeometry args={[TILE_W() * 1.5, TILE_H() * 0.34]} />
          <meshBasicMaterial map={openLabel} transparent alphaTest={0.02} toneMapped={false} clippingPlanes={CLIP} />
        </mesh>
        <mesh>
          <planeGeometry args={[TILE_W(), TILE_H()]} />
          <meshStandardMaterial
            ref={(m) => {
              openFace.current = m
            }}
            map={shown ? offerFrontTexture(OFFERS[shown.open]) : undefined}
            emissiveMap={shown ? offerFrontTexture(OFFERS[shown.open]) : undefined}
            emissive="#ffffff"
            emissiveIntensity={0.08}
            transparent
            alphaTest={0.02}
            toneMapped={false}
            side={THREE.FrontSide}
            clippingPlanes={CLIP}
          />
        </mesh>
      </group>
      {/* Закрытые офферы — выбор игрока. */}
      {Array.from({ length: CLOSED_COUNT }, (_, i) => {
        const value = shown?.closed[i]
        const revealed = shown?.picked === i && value != null
        return (
          <group key={i} position={[closedX(i), ROW_Y(), 0.1]}>
            <group
              ref={(g) => {
                closedTiles.current[i] = g
              }}
              onClick={(e) => {
                if (useGame.getState().phase !== 'upgrade') return
                e.stopPropagation()
                pickOffer(i)
              }}
              onPointerOver={(e) => {
                if (useGame.getState().phase !== 'upgrade') return
                e.stopPropagation()
                hovered.current = i
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                if (hovered.current !== i) return
                hovered.current = -1
                document.body.style.cursor = ''
              }}
            >
              <mesh>
                <planeGeometry args={[TILE_W(), TILE_H()]} />
                <meshStandardMaterial
                  ref={(m) => {
                    closedFaces.current[i] = m
                  }}
                  map={backTex[i]}
                  emissiveMap={backTex[i]}
                  emissive="#ffffff"
                  emissiveIntensity={0.04}
                  transparent
                  alphaTest={0.02}
                  toneMapped={false}
                  side={THREE.FrontSide}
                  clippingPlanes={CLIP}
                />
              </mesh>
              <mesh rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[TILE_W(), TILE_H()]} />
                <meshStandardMaterial
                  map={value != null ? offerFrontTexture(OFFERS[value]) : undefined}
                  emissiveMap={value != null ? offerFrontTexture(OFFERS[value]) : undefined}
                  emissive="#ffffff"
                  emissiveIntensity={revealed ? 0.1 : 0}
                  transparent
                  alphaTest={0.02}
                  toneMapped={false}
                  side={THREE.FrontSide}
                  clippingPlanes={CLIP}
                />
              </mesh>
            </group>
          </group>
        )
      })}
    </group>
  )
}
