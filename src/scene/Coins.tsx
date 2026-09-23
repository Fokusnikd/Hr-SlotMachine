import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGame } from '../game/store'

const MAX = 120

interface Coin {
  alive: boolean
  p: THREE.Vector3
  v: THREE.Vector3
  r: THREE.Euler
  w: THREE.Vector3
  delay: number
}

export function Coins() {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const coins = useMemo<Coin[]>(
    () =>
      Array.from({ length: MAX }, () => ({
        alive: false,
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Euler(),
        w: new THREE.Vector3(),
        delay: 0,
      })),
    [],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const burst = (count: number, fromY: number, spread: number) => {
    let spawned = 0
    for (const c of coins) {
      if (spawned >= count) break
      if (c.alive) continue
      c.alive = true
      c.delay = Math.random() * 0.5
      c.p.set((Math.random() - 0.5) * spread, fromY, 0.6 + Math.random() * 0.4)
      c.v.set((Math.random() - 0.5) * 4, 3 + Math.random() * 4, 1.5 + Math.random() * 2.5)
      c.r.set(Math.random() * 6, Math.random() * 6, 0)
      c.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, 0)
      spawned++
    }
  }

  const phase = useGame((s) => s.phase)
  const rarity = useGame((s) => s.result?.rarity)
  const exchanged = useGame((s) => s.stats.exchanged)
  const firstExchange = useRef(exchanged)

  useEffect(() => {
    // Монет меньше, чем раньше: главное шоу теперь — анимации самих слотов.
    if (phase === 'win') burst(rarity === 'legendary' ? 60 : rarity === 'rare' ? 32 : 16, -0.4, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    if (exchanged !== firstExchange.current) burst(40, -2.4, 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchanged])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    coins.forEach((c, i) => {
      if (c.alive) {
        if (c.delay > 0) c.delay -= dt
        else {
          c.v.y -= 9.8 * dt
          c.p.addScaledVector(c.v, dt)
          c.r.x += c.w.x * dt
          c.r.y += c.w.y * dt
          if (c.p.y < -4.5) c.alive = false
        }
      }
      dummy.position.copy(c.p)
      dummy.rotation.copy(c.r)
      dummy.scale.setScalar(c.alive && c.delay <= 0 ? 1 : 0)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <cylinderGeometry args={[0.15, 0.15, 0.035, 24]} />
      <meshStandardMaterial color="#ffc93c" metalness={0.8} roughness={0.25} emissive="#ffb000" emissiveIntensity={0.5} />
    </instancedMesh>
  )
}
