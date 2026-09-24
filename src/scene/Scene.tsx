import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Sparkles } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { fitWindow, MACHINE, SlotMachine } from './SlotMachine'
import { setLayout, useLayoutVersion } from './layout'
import { Coins } from './Coins'
import { NightOffice } from './NightOffice'
import { useGame } from '../game/store'
import { extrasFor } from '../game/fx'
import { flipStart } from './tileFx'

const LOOK = new THREE.Vector3()

/**
 * Камера кадрирует автомат впритык к краям экрана: от вывески до нижнего края панели,
 * от левого края корпуса до шара рычага. Под соотношение сторон экрана подстраивается
 * окно барабанов (fitWindow), поэтому пустых полей по бокам/сверху нет.
 * Узкий угол обзора — почти без перспективы, но корпус и клавиши остаются объёмными.
 */
function CameraRig() {
  const { camera, size, scene } = useThree()
  useFrame(() => {
    const aspect = size.width / size.height
    const [w, h] = fitWindow(aspect)
    setLayout(w, h)

    const cam = camera as THREE.PerspectiveCamera
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const top = MACHINE.top
    // Панель наклонена к зрителю и в перспективе чуть крупнее — небольшой запас снизу.
    const bottom = MACHINE.deckBottom(aspect) - 0.12
    const cx = (MACHINE.left + MACHINE.right) / 2
    const cy = (top + bottom) / 2
    const halfH = (top - bottom) / 2
    const halfW = (MACHINE.right - MACHINE.left) / 2
    const dist = Math.max(halfH / tanHalf, halfW / (tanHalf * aspect)) + MACHINE.FRONT_Z
    cam.position.set(cx, cy, dist)
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = dist + 1
      scene.fog.far = dist + 18
    }
    LOOK.set(cx, cy, 0)
    cam.lookAt(LOOK)

    // Толчок камеры на крупном выигрыше (×5+) — в момент, когда закончились перевороты слотов.
    const { phase, result, winAt, settings } = useGame.getState()
    if (settings.fx && phase === 'win' && result && extrasFor(result.wins[0]?.matched.length ?? 0).shake) {
      const n = result.winCells.length
      const peak = flipStart(n - 1, n) + 0.55
      const tt = (performance.now() - winAt) / 1000 - peak
      if (tt > 0 && tt < 0.5) {
        const a = 0.07 * (1 - tt / 0.5)
        cam.position.x += (Math.random() - 0.5) * a
        cam.position.y += (Math.random() - 0.5) * a
      }
    }
  })
  return null
}

/** Пол под автоматом — опускается вместе с корпусом, когда окно вытягивается по высоте. */
function Floor() {
  useLayoutVersion()
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, MACHINE.bottom - 0.02, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#1a1430" roughness={0.5} metalness={0.3} />
      </mesh>
      <ContactShadows position={[0, MACHINE.bottom, 0]} opacity={0.7} scale={14} blur={2.4} far={4} />
    </>
  )
}

export function Scene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 20, position: [0, 0.4, 24] }} gl={{ antialias: true }} onCreated={({ gl, scene }) => {
        gl.localClippingEnabled = true
        if (import.meta.env.DEV) (window as unknown as { __scene: THREE.Scene }).__scene = scene
      }}>
      <color attach="background" args={['#0b0614']} />
      <fog attach="fog" args={['#0b0614', 14, 30]} />

      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#b69bff', '#1a0a2a', 0.6]} />
      <directionalLight position={[3, 6, 8]} intensity={1.6} />
      <pointLight position={[-6, 2, 3]} intensity={30} color="#ff3fd8" distance={16} />
      <pointLight position={[6, 1, 3]} intensity={30} color="#3ff6ff" distance={16} />
      <spotLight position={[0, 4, 6]} angle={0.5} penumbra={0.6} intensity={40} target-position={[0, 0, 0]} />

      <CameraRig />
      <NightOffice />
      <SlotMachine />
      <Coins />

      <Sparkles count={60} scale={[16, 9, 6]} position={[0, 1, -4]} size={3} speed={0.3} color="#ff9cf0" opacity={0.6} />
      <Floor />

      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={1} intensity={1.1} radius={0.7} />
        {/* Виньетка слабее: по краям экрана теперь виден ночной офис. */}
        <Vignette eskil={false} offset={0.3} darkness={0.45} />
      </EffectComposer>
    </Canvas>
  )
}
