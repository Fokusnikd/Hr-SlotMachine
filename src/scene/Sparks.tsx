import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { dotTexture } from './textures'

const MAX = 260

interface Spark {
  life: number
  max: number
  p: THREE.Vector3
  v: THREE.Vector3
  size: number
}

const queue: { x: number; y: number; z: number; color: string; count: number; speed: number }[] = []

/** Шина событий: слоты просят выпустить искры, компонент Sparks их рисует. */
export const sparkBus = {
  emit(x: number, y: number, z: number, color: string, count = 14, speed = 1) {
    queue.push({ x, y, z, color, count, speed })
  },
}

/** Искры и конфетти поверх барабанов: один instanced-меш на все частицы. */
export function Sparks() {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const sparks = useMemo<Spark[]>(() => Array.from({ length: MAX }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), size: 0.05 })), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const col = useMemo(() => new THREE.Color(), [])
  const tex = useMemo(() => dotTexture(), [])

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    while (queue.length) {
      const e = queue.shift()!
      let n = e.count
      for (let i = 0; i < MAX && n > 0; i++) {
        const s = sparks[i]
        if (s.life > 0) continue
        const a = Math.random() * Math.PI * 2
        const sp = (0.8 + Math.random() * 1.6) * e.speed
        s.p.set(e.x + (Math.random() - 0.5) * 0.4, e.y + (Math.random() - 0.5) * 0.25, e.z)
        s.v.set(Math.cos(a) * sp, Math.sin(a) * sp + 0.8, 0.6 + Math.random() * 0.8)
        s.max = s.life = 0.6 + Math.random() * 0.6
        s.size = 0.05 + Math.random() * 0.07
        col.set(e.color).lerp(new THREE.Color('#ffffff'), Math.random() * 0.5)
        mesh.current.setColorAt(i, col)
        n--
      }
      if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    }
    sparks.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt
        s.v.y -= 3.2 * dt
        s.v.multiplyScalar(1 - dt * 1.2)
        s.p.addScaledVector(s.v, dt)
      }
      dummy.position.copy(s.p)
      dummy.quaternion.copy(camera.quaternion)
      dummy.scale.setScalar(s.life > 0 ? s.size * (0.4 + 0.6 * (s.life / s.max)) * 2 : 0)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  )
}
