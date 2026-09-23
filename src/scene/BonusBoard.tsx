import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../game/store'
import { BOARD_SIZE, type BonusGame } from '../game/bonus'
import { folderBackTexture, folderFrontTexture } from './textures'
import { ROW_H, WIN_H, WIN_W } from './layout'
import { sfx } from '../audio/sfx'
import { sparkBus } from './Sparks'

/** Миниигра «Золотая папка» в окне барабанов: 4×3 папки, которые переворачиваются по клику. */
const COLS = 4
const CELL_W = WIN_W / COLS
const FOLDER_H = ROW_H - 0.14
const FOLDER_W = Math.min(CELL_W - 0.2, FOLDER_H * (400 / 280))
const CLIP = [new THREE.Plane(new THREE.Vector3(0, -1, 0), WIN_H / 2), new THREE.Plane(new THREE.Vector3(0, 1, 0), WIN_H / 2)]
/** Задержка появления папок после старта бонуса (пока уезжают барабаны), с. */
const ENTER_DELAY = 0.45

const folderX = (i: number) => ((i % COLS) - (COLS - 1) / 2) * CELL_W
const folderY = (i: number) => (1 - Math.floor(i / COLS)) * ROW_H

type Face = 'hire' | 'reject' | 'empty' | 'shield'
const faceOf = (g: BonusGame, i: number): Face => (g.blocked.includes(i) ? 'shield' : g.board[i])

export function BonusBoard() {
  const root = useRef<THREE.Group>(null!)
  const folders = useRef<(THREE.Group | null)[]>([])
  const backs = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  const fronts = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  const hovered = useRef(-1)
  /** Последняя партия — держим, пока доска уезжает после окончания бонуса. */
  const last = useRef<BonusGame | null>(null)
  const appear = useRef(0)
  const bonus = useGame((s) => s.bonus)
  const openFolder = useGame((s) => s.openFolder)
  if (bonus) last.current = bonus
  const shown = bonus ?? last.current

  const frontTex = useMemo(() => Array.from({ length: BOARD_SIZE }, (_, i) => folderFrontTexture(i + 1)), [])

  // Звук и искры на каждое открытие; фанфары и конфетти на исход.
  const prev = useRef<BonusGame | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = bonus
    if (!bonus) return
    if (!p || p.board !== bonus.board) {
      sfx.win('legendary')
      return
    }
    const opened = bonus.openedAt.findIndex((v, i) => v >= 0 && p.openedAt[i] < 0)
    if (opened >= 0) {
      sfx.whoosh()
      const f = faceOf(bonus, opened)
      const color = f === 'hire' ? '#5cff9a' : f === 'reject' ? '#ff2d55' : f === 'shield' ? '#6ab4ff' : '#fff2c4'
      setTimeout(() => {
        if (f === 'hire') sfx.ding(4 + bonus.hires * 2)
        else if (f === 'reject') sfx.nearMiss()
        else if (f === 'shield') sfx.ding(2)
        if (f !== 'empty') sparkBus.emit(folderX(opened), folderY(opened), 0.45, color, f === 'hire' ? 18 : 10)
      }, 220)
    }
    if (bonus.status !== p.status) {
      if (bonus.status === 'won') {
        setTimeout(() => {
          sfx.win('legendary')
          bonus.board.forEach((f, i) => f === 'hire' && bonus.openedAt[i] >= 0 && sparkBus.emit(folderX(i), folderY(i), 0.5, '#ffd84a', 26, 1.5))
        }, 350)
      } else if (bonus.status === 'lost') setTimeout(() => sfx.coins(10), 400)
    }
  }, [bonus])

  useFrame((state, dt) => {
    const g = shown
    const { phase, bonusAt } = useGame.getState()
    const on = phase === 'bonus' && (performance.now() - bonusAt) / 1000 > ENTER_DELAY
    appear.current += ((on ? 1 : 0) - appear.current) * (1 - Math.exp(-dt * (on ? 6 : 8)))
    root.current.visible = appear.current > 0.01 && !!g
    // Сверху — вниз, в окно.
    root.current.position.y = (1 - appear.current) * WIN_H * 1.1
    if (!g) return
    const t = state.clock.elapsedTime
    const over = g.status !== 'play'
    const kr = 1 - Math.exp(-dt * 10)
    folders.current.forEach((f, i) => {
      if (!f) return
      const opened = g.openedAt[i] >= 0
      // Перевороты: открытые — сразу, неоткрытые — раскрываются по окончании игры.
      const target = opened || over ? Math.PI : 0
      f.rotation.y += (target - f.rotation.y) * kr
      const hover = !over && !opened && hovered.current === i
      const win = over && g.status === 'won' && opened && g.board[i] === 'hire'
      const s = hover ? 1.07 : win ? 1.06 + Math.sin(t * 8) * 0.04 : 1
      f.scale.x += (s - f.scale.x) * kr
      f.scale.y += (s - f.scale.y) * kr
      f.position.z = hover ? 0.12 : win ? 0.1 : 0
      const back = backs.current[i]
      if (back) {
        // Не открытые игроком папки после игры — приглушены: видно, что было внутри.
        const c = over && !opened ? 0.45 : 1
        back.color.setScalar(THREE.MathUtils.lerp(back.color.r, c, kr))
        back.emissiveIntensity = win ? 0.18 + Math.sin(t * 8) * 0.1 : 0
      }
      const front = fronts.current[i]
      if (front) front.emissiveIntensity = hover ? 0.25 : !over ? 0.06 + 0.04 * Math.sin(t * 3 + i) : 0
    })
  })

  return (
    <group ref={root} visible={false}>
      {/* Сукно под папками — перед разделителями барабанов (они заканчиваются на z = 0). */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[WIN_W, WIN_H]} />
        <meshStandardMaterial color="#2a0c3f" roughness={0.95} clippingPlanes={CLIP} />
      </mesh>
      {Array.from({ length: BOARD_SIZE }, (_, i) => {
        const face = shown ? faceOf(shown, i) : 'empty'
        return (
          <group key={i} position={[folderX(i), folderY(i), 0.1]}>
            <group
              ref={(g) => {
                folders.current[i] = g
              }}
              onClick={(e) => {
                if (useGame.getState().phase !== 'bonus') return
                e.stopPropagation()
                openFolder(i)
              }}
              onPointerOver={(e) => {
                if (useGame.getState().phase !== 'bonus') return
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
                <planeGeometry args={[FOLDER_W, FOLDER_H]} />
                <meshStandardMaterial
                  ref={(m) => {
                    fronts.current[i] = m
                  }}
                  map={frontTex[i]}
                  emissiveMap={frontTex[i]}
                  emissive="#ffffff"
                  emissiveIntensity={0}
                  transparent
                  alphaTest={0.02}
                  toneMapped={false}
                  side={THREE.FrontSide}
                  clippingPlanes={CLIP}
                />
              </mesh>
              <mesh rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[FOLDER_W, FOLDER_H]} />
                <meshStandardMaterial
                  ref={(m) => {
                    backs.current[i] = m
                  }}
                  map={folderBackTexture(face)}
                  emissiveMap={folderBackTexture(face)}
                  emissive="#ffffff"
                  emissiveIntensity={0}
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
