import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Sparkles } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { MACHINE, SlotMachine } from './SlotMachine'
import { Coins } from './Coins'
import { useGame } from '../game/store'
import { extrasFor } from '../game/fx'
import { flipStart } from './tileFx'

/** Кадрируем машину от вывески до панели с кнопками; тумба уходит за нижний край. */
const FRAME_TOP = MACHINE.top + 0.1
const FRAME_HALF_W = MACHINE.OUTER_W / 2 + 0.7
const LOOK = new THREE.Vector3()

/** Камера подстраивается под соотношение сторон и слегка следует за курсором. */
function CameraRig() {
  const { camera, size, pointer, scene } = useThree()
  useFrame(() => {
    const aspect = size.width / size.height
    const cam = camera as THREE.PerspectiveCamera
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    // Вписываем кадр по высоте и ширине; сверху полоса UI (~9 % высоты) — берём запас.
    const bottom = MACHINE.deckBottom(aspect) - 0.15
    const halfH = (FRAME_TOP - bottom) / 2 / 0.9
    LOOK.set(0, (FRAME_TOP + bottom) / 2 + halfH * 0.06, 0)
    const halfW = MACHINE.isCompact(aspect) ? MACHINE.OUTER_W / 2 + 0.05 : FRAME_HALF_W
    const dist = Math.max(halfH / tanHalf, halfW / (tanHalf * aspect)) + MACHINE.FRONT_Z + 0.5
    cam.position.x = THREE.MathUtils.lerp(cam.position.x, pointer.x * 0.8, 0.05)
    cam.position.y = THREE.MathUtils.lerp(cam.position.y, 0.1 + pointer.y * 0.4, 0.05)
    cam.position.z = dist
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = dist + 1
      scene.fog.far = dist + 18
    }
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

export function Scene() {
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 38, position: [0, 0.4, 13] }} gl={{ antialias: true }} onCreated={({ gl, scene }) => {
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
      <SlotMachine />
      <Coins />

      <Sparkles count={60} scale={[16, 9, 6]} position={[0, 1, -4]} size={3} speed={0.3} color="#ff9cf0" opacity={0.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, MACHINE.bottom - 0.02, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#140a22" roughness={0.55} metalness={0.3} />
      </mesh>
      <ContactShadows position={[0, MACHINE.bottom, 0]} opacity={0.7} scale={14} blur={2.4} far={4} />

      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={1} intensity={1.1} radius={0.7} />
        <Vignette eskil={false} offset={0.2} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  )
}
