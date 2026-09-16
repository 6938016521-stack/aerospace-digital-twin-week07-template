import { extendImmutable } from '../module-system/registry'
import type { AircraftState } from '../state/types'
import { quantity } from '../units/types'
export const PITCH_DISPLAY_GUARD = Math.PI / 6
export function requirePitchReady(state: AircraftState) {
  const inertia = state.massProperties.pitchInertia
  const moment = state.loads.pitchMoment
  const pitch = state.motion.pitch, rate = state.motion.pitchRate
  const dt = state.simulation.timeStep, time = state.simulation.elapsedTime
  if (inertia.status !== 'known' || inertia.value <= 0 || moment.status !== 'known' || pitch.status !== 'known' || rate.status !== 'known' || dt.status !== 'known' || dt.value <= 0 || dt.value > 0.1 || time.status !== 'known') throw new Error('Configure inertia, loads and initialize pitch before stepping.')
  return { inertia, moment, pitch, rate, dt, time }
}
export function stepPitch(state: AircraftState, commandId: string): AircraftState {
  const { inertia, moment, pitch, rate, dt, time } = requirePitchReady(state)
  const acceleration = moment.value / inertia.value
  if (!Number.isFinite(acceleration)) throw new Error('Pitch acceleration exceeds finite arithmetic.')
  const angleAt = (t: number) => pitch.value + rate.value * t + 0.5 * acceleration * t ** 2
  // Split at the turning point so a boundary crossing followed by a return
  // inside the same step cannot be missed.
  const turning = acceleration === 0 ? -1 : -rate.value / acceleration
  const ends = turning > 0 && turning < dt.value ? [turning, dt.value] : [dt.value]
  let duration = dt.value, boundary: number | null = null, start = 0
  for (const end of ends) {
    const angle = angleAt(end)
    if (!Number.isFinite(angle)) throw new Error('Pitch step exceeds finite arithmetic.')
    if (Math.abs(angle) >= PITCH_DISPLAY_GUARD) {
      boundary = Math.sign(angle) * PITCH_DISPLAY_GUARD
      let low = start, high = end
      for (let i = 0; i < 1075; i++) {
        const middle = (low + high) / 2
        if (middle === low || middle === high) break
        if (angleAt(middle) * Math.sign(boundary) >= PITCH_DISPLAY_GUARD) high = middle
        else low = middle
      }
      duration = high
      break
    }
    start = end
  }
  const nextPitch = boundary ?? angleAt(duration)
  const nextRate = rate.value + acceleration * duration
  const id = `kernel:pitch-step:${commandId}`
  if (Object.hasOwn(state.provenance, id)) throw new Error('Pitch step provenance already exists.')
  if (Math.abs(pitch.value) >= PITCH_DISPLAY_GUARD) throw new Error('30° display guard reached. Reinitialize pitch to continue.')
  return { ...state,
    motion: { ...state.motion, pitch: quantity(nextPitch, 'rad', id), pitchRate: quantity(nextRate, 'rad/s', id) },
    simulation: { ...state.simulation, elapsedTime: quantity(time.value + duration, 's', id), status: boundary !== null ? 'paused' : state.simulation.status },
    provenance: extendImmutable(state.provenance, { [id]: { id, source: 'computed', description: 'Constant-moment pitch step, shortened to the first display-boundary crossing when needed; elapsed time and rate use the accepted duration.', derivedFrom: [inertia.provenanceId, moment.provenanceId, pitch.provenanceId, rate.provenanceId, dt.provenanceId, time.provenanceId] } }),
  }
}
