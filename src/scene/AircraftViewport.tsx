import { PitchVisuals } from './PitchVisuals'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls, useGLTF } from '@react-three/drei'
import { Group, Mesh, MeshStandardMaterial, PCFShadowMap } from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import type { AircraftStore, StoreSnapshot } from '../platform/state/store'
import { AIRCRAFT_ASSET } from './aircraft/definition'
import type { SurfaceControl } from './aircraft/definition'
import { articulate, cgPosition, commitCG, validateRig } from './bindings'

export interface ViewProps {
  store: AircraftStore; snapshot: StoreSnapshot; axes: boolean; transparency: number; drag: boolean
  hidePitchVisuals?: boolean
  selected: SurfaceControl | ''; onSelect: (control: SurfaceControl) => void
  cameraView: { name: string; revision: number }; onError: (message: string) => void
}
const views: Record<string, [number, number, number]> = {
  Perspective: [9, 6, 9], Top: [0, 17, 0.01], Side: [0, 2, 14], Front: [14, 2, 0],
}
function Camera({ view, height }: { view: ViewProps['cameraView']; height: number }) {
  const controls = useRef<OrbitImpl>(null)
  const { camera, invalidate } = useThree()
  const previous = useRef<{ view: typeof view; height: number } | null>(null)
  useEffect(() => {
    const position = views[view.name]!
    if (previous.current?.view === view) {
      const shift = height - previous.current.height
      camera.position.setY(camera.position.y + shift)
      if (controls.current) controls.current.target.setY(controls.current.target.y + shift)
    } else {
      camera.position.set(position[0], position[1] + height - 1.1, position[2])
      controls.current?.target.set(0, height, 0)
    }
    previous.current = { view, height }
    controls.current?.update()
    invalidate()
  }, [view, height, camera, invalidate])
  return <OrbitControls ref={controls} makeDefault minDistance={4} maxDistance={40} maxPolarAngle={Math.PI / 2} />
}
function Aircraft(props: ViewProps) {
  const gltf = useGLTF(`${import.meta.env.BASE_URL}${AIRCRAFT_ASSET.file}`)
  const root = useMemo(() => {
    const copy = gltf.scene.clone(true)
    validateRig(copy)
    copy.traverse((object) => {
      if ((object as Mesh).isMesh) (object as Mesh).material = Array.isArray((object as Mesh).material) ? ((object as Mesh).material as MeshStandardMaterial[]).map((m) => m.clone()) : ((object as Mesh).material as MeshStandardMaterial).clone()
    })
    return copy
  }, [gltf.scene])
  const { invalidate } = useThree()
  useEffect(() => () => {
    root.traverse((object) => {
      if ((object as Mesh).isMesh) {
        const materials = Array.isArray((object as Mesh).material) ? (object as Mesh).material as MeshStandardMaterial[] : [(object as Mesh).material as MeshStandardMaterial]
        materials.forEach((material) => material.dispose())
      }
    })
  }, [root])
  useEffect(() => {
    articulate(root, props.snapshot.state)
    root.traverse((object) => {
      if (!(object as Mesh).isMesh) return
      const materials = Array.isArray((object as Mesh).material) ? (object as Mesh).material as MeshStandardMaterial[] : [(object as Mesh).material as MeshStandardMaterial]
      for (const material of materials) {
        if (!material.isMeshStandardMaterial) continue
        if (!material.userData.baseColor) material.userData.baseColor = material.color.clone()
        const selected = !!props.selected && object.userData.control === props.selected
        material.color.copy(material.userData.baseColor)
        if (selected) material.color.set('#00dfff')
        material.emissive.set(selected ? '#008ca8' : '#000000')
        material.emissiveIntensity = selected ? 0.6 : 0
        material.transparent = props.transparency > 0 || object.name === 'Canopy'
        material.opacity = (1 - props.transparency / 100) * (object.name === 'Canopy' ? 0.78 : 1)
        material.depthWrite = !material.transparent
        material.needsUpdate = true
        object.castShadow = props.transparency === 0
      }
    })
    invalidate()
  }, [root, props.snapshot, props.transparency, props.selected, invalidate])
  return <primitive object={root} onClick={(event: { stopPropagation(): void; object: Mesh }) => {
    const control = event.object.userData.control as SurfaceControl | undefined
    if (control) { event.stopPropagation(); props.onSelect(control) }
  }} />
}
function CG(props: ViewProps) {
  const marker = useRef<Group>(null)
  const start = useRef<StoreSnapshot | null>(null)
  const position = cgPosition(props.snapshot.state)
  if (!position) return null
  const dot = <group ref={marker} position={position}><mesh renderOrder={10}><sphereGeometry args={[0.13, 20, 12]} /><meshBasicMaterial color="#ffe469" depthTest={false} /></mesh></group>
  return <><group position={[0, props.snapshot.state.simulation.status === 'unconfigured' ? 1.1 : 4, 0]} rotation={[Math.PI / 2, 0, 0]}>{dot}</group>{props.drag && <TransformControls object={marker as RefObject<Group>} mode="translate" space="local" size={0.8} onMouseDown={() => { start.current = props.store.getSnapshot() }} onMouseUp={() => {
    if (!marker.current || !start.current) return
    const result = commitCG(props.store, start.current, marker.current.position.toArray())
    if (!result.ok) { marker.current.position.set(...(cgPosition(props.store.getSnapshot().state) ?? position)); props.onError(result.error) }
    start.current = null
  }} />}</>
}
export default function AircraftViewport(props: ViewProps) {
  const state = props.snapshot.state
  const height = state.simulation.status === 'unconfigured' ? 1.1 : 4
  const cg = cgPosition(state) ?? [0, 0, 0]
  const pitch = state.motion.pitch.status === 'known' ? state.motion.pitch.value : 0
  return <Canvas shadows={{ type: PCFShadowMap }} frameloop="demand" dpr={[1, 1.5]} camera={{ position: [9, 6, 9], fov: 42 }} fallback={<p>WebGL unavailable. Numeric controls remain available below.</p>}>
    <color attach="background" args={['#142b36']} />
    <ambientLight intensity={1.5} /><directionalLight position={[6, 12, 5]} intensity={3} castShadow shadow-mapSize={[2048, 2048]} />
    <Camera view={props.cameraView} height={height} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#4f7838" /></mesh>
    <gridHelper args={[60, 30, '#608548', '#547b3e']} position={[0, 0.005, 0]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><planeGeometry args={[40, 4]} /><meshStandardMaterial color="#35464b" /></mesh>
    {[-16,-12,-8,0,8,12,16].map((x) => <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.015, 0]}><planeGeometry args={[1.8, 0.08]} /><meshBasicMaterial color="#91a5a9" /></mesh>)}
    <group position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}><group position={cg} rotation={[0, pitch, 0]}><group position={[-cg[0], -cg[1], -cg[2]]}>
      <Suspense fallback={null}><Aircraft {...props} /></Suspense>
      {props.axes && <axesHelper args={[3.8]} />}
      {state.simulation.status !== 'unconfigured' && !props.hidePitchVisuals && <PitchVisuals state={state} />}
    </group></group></group>
    <CG {...props} />
  </Canvas>
}
