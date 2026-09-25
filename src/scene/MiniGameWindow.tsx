import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame, type Phase } from '../game/store'
import { CLIP, useLayoutVersion, WIN_H, WIN_W } from './layout'

/**
 * Общее окно миниигр («Золотая папка», «Колесо торга») в окне барабанов.
 *
 * Берёт на себя всё, что у миниигр одинаково: въезд сверху после старта фазы (с задержкой, пока
 * уезжают барабаны) и выезд после окончания, видимость, сукно на всё окно, сброс курсора-руки,
 * когда окно уезжает. Содержимое (папки, колесо, кнопки) — дети.
 *
 * Обработчики кликов внутри оборачивайте в `inPhase(phase)`: невидимые объекты three.js тоже
 * ловят луч, и без проверки спрятанное окно реагировало бы на клики.
 */
export interface MiniGameWindowProps {
  /** Фаза, в которой окно показывается. */
  phase: Extract<Phase, 'bonus' | 'upgrade'>
  /** Момент старта фазы (performance.now()) — от него отсчитывается задержка въезда. */
  startedAt: (s: ReturnType<typeof useGame.getState>) => number
  /** Задержка въезда после старта фазы, с. */
  enterDelay: number
  /** Есть ли что показывать (партия или последняя партия, пока окно уезжает). */
  hasContent: boolean
  /** Цвет сукна. */
  cloth: string
  clothRoughness?: number
  children: ReactNode
}

/** Сейчас идёт эта фаза — для проверок в обработчиках кликов/наведения. */
export const inPhase = (phase: Phase) => useGame.getState().phase === phase

export function MiniGameWindow({ phase, startedAt, enterDelay, hasContent, cloth, clothRoughness = 0.9, children }: MiniGameWindowProps) {
  // Размер окна меняется под экран — перерисовываемся вместе с ним.
  useLayoutVersion()
  const root = useRef<THREE.Group>(null!)
  const appear = useRef(0)
  const wasOn = useRef(false)

  useFrame((_, dt) => {
    const s = useGame.getState()
    const on = s.phase === phase && (performance.now() - startedAt(s)) / 1000 > enterDelay
    // Окно уезжает — рука-курсор с его кнопок/папок больше не нужна.
    if (wasOn.current && !on) document.body.style.cursor = ''
    wasOn.current = on
    appear.current += ((on ? 1 : 0) - appear.current) * (1 - Math.exp(-dt * (on ? 6 : 8)))
    root.current.visible = appear.current > 0.01 && hasContent
    // Сверху — вниз, в окно.
    root.current.position.y = (1 - appear.current) * WIN_H * 1.1
  })

  return (
    <group ref={root} visible={false}>
      {/* Сукно — перед разделителями барабанов (они заканчиваются на z = 0). */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[WIN_W, WIN_H]} />
        <meshStandardMaterial color={cloth} roughness={clothRoughness} clippingPlanes={CLIP} />
      </mesh>
      {children}
    </group>
  )
}
