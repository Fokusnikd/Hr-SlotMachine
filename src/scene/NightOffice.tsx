import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { nightOfficeTexture } from './textures'

/** Глубина задника за автоматом. */
const BACK_Z = -5

/**
 * Задник «ночной офис». Плоскость стоит за автоматом и каждый кадр растягивается ровно на
 * кадр камеры на своей глубине — края картинки совпадают с краями экрана, поэтому в
 * просветах у рычага, по углам вывески и по бокам панели видны окна, город и столы.
 */
export function NightOffice() {
  const mesh = useRef<THREE.Mesh>(null!)
  const { camera, size } = useThree()
  const tex = useMemo(() => nightOfficeTexture(), [])
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera
    const d = cam.position.z - BACK_Z
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * d
    mesh.current.position.set(cam.position.x, cam.position.y, BACK_Z)
    mesh.current.scale.set(h * (size.width / size.height), h, 1)
  })
  return (
    <mesh ref={mesh} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} toneMapped={false} fog={false} depthWrite={false} />
    </mesh>
  )
}
