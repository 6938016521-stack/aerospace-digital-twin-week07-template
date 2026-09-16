import { Html, Line } from '@react-three/drei'
import { Vector3 } from 'three'
import type { AircraftState } from '../platform'
import { cgPosition } from './bindings'
export function PitchVisuals({ state }: { state: AircraftState }) {
  const cg = cgPosition(state)
  const mode = state.modules.controls?.aeroMode
  const estimate = mode?.status === 'known' && mode.value === 2 && state.outputs.controls?.withinEnvelope?.status === 'known' && state.outputs.controls.withinEnvelope.value === 0
  const force = estimate ? state.outputs.controls?.estimatedForce : mode?.status === 'known' && mode.value > 0 ? state.outputs.controls?.effectiveTailForce : state.modules.controls?.tailForce, station = state.modules.controls?.tailStation
  const moment = estimate ? state.outputs.controls?.estimatedNetMoment ?? state.loads.pitchMoment : state.loads.pitchMoment
  if (!cg) return null
  const hasForce = force?.status === 'known' && station?.status === 'known'
  const application: [number, number, number] = [(station?.status === 'known' ? station.value : cg[0]), cg[1], cg[2]]
  const length = Math.min(3, Math.abs(force?.status === 'known' ? force.value : 0) / 250)
  const sign = Math.sign(force?.status === 'known' ? force.value : 0)
  const momentSign = moment.status === 'known' ? Math.sign(moment.value) : 0
  const arc: [number, number, number][] = Array.from({ length: 33 }, (_, index) => {
    const angle = index / 32 * Math.PI * 0.7 * momentSign
    return [cg[0] + 1.1 * Math.cos(angle), cg[1], cg[2] - 1.1 * Math.sin(angle)]
  })
  return <group>
    {hasForce && <><Line points={[cg, application]} color="#67e4ec" lineWidth={2} dashed dashSize={0.15} gapSize={0.1} />
    {length > 0 && <arrowHelper args={[new Vector3(0, 0, sign), new Vector3(...application), length, '#ffbe69', 0.25, 0.13]} />}
    <Html position={[(station?.status === 'known' ? station.value : cg[0]), cg[1], cg[2] + (sign || 1) * (length + 0.5)]} center><span className="force-label">{estimate ? 'Requested Fz estimate' : mode?.status === 'known' && mode.value > 0 ? 'Equivalent Fz' : 'Fz'} {(force?.status === 'known' ? force.value : 0).toFixed(0)} N</span></Html>
    <Html position={[(cg[0] + (station?.status === 'known' ? station.value : cg[0])) / 2, cg[1], cg[2] - 0.3]} center><span className="arm-label">l⊥ {Math.abs(cg[0] - (station?.status === 'known' ? station.value : cg[0])).toFixed(2)} m</span></Html></>}
    {momentSign !== 0 && <><Line points={arc} color="#bcacff" lineWidth={2} /><arrowHelper args={[new Vector3(-Math.sin(Math.PI * 0.7 * momentSign) * momentSign, 0, -Math.cos(Math.PI * 0.7 * momentSign) * momentSign), new Vector3(...arc[32]!), 0.25, '#bcacff', 0.2, 0.12]} /></>}
    <Html position={[cg[0], cg[1], cg[2] - 1.6]} center><span className="moment-label">{estimate ? 'Requested ΣMy estimate' : 'ΣMy'} {moment.status === 'known' ? moment.value.toFixed(0) : '—'} N·m</span></Html>
  </group>
}
