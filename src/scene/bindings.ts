import type { Object3D } from 'three'
import type { AircraftState } from '../platform/state/types'
import type { AircraftStore, StoreSnapshot } from '../platform/state/store'
import { JOINTS, ANCHORS } from './aircraft/definition'
import type { SurfaceControl } from './aircraft/definition'

export function surfacePose(state: AircraftState, control: SurfaceControl) {
  const physical = state.controls[control]
  const commanded = state.controls[`${control}Commanded`]
  return physical.status === 'known' ? { radians: physical.value, source: 'Physical state' } :
    commanded.status === 'known' ? { radians: commanded.value, source: 'Command preview' } :
      { radians: 0, source: 'Neutral visual pose · unconfigured' }
}
export function cgPosition(state: AircraftState): [number, number, number] | null {
  const { cgX, cgY, cgZ } = state.massProperties
  return cgX.status === 'known' && cgY.status === 'known' && cgZ.status === 'known' ? [cgX.value, cgY.value, cgZ.value] : null
}
export function validateRig(root: Object3D) {
  for (const name of ['Fuselage', ...Object.keys(JOINTS), ...Object.keys(ANCHORS)]) {
    if (!root.getObjectByName(name)) throw new Error(`Aircraft asset is missing ${name}`)
  }
  for (const [name, joint] of Object.entries(JOINTS)) {
    if (root.getObjectByName(joint.surface)?.parent?.name !== name) throw new Error(`Invalid hinge: ${name}`)
  }
}
export function articulate(root: Object3D, state: AircraftState) {
  for (const [name, joint] of Object.entries(JOINTS)) {
    root.getObjectByName(name)!.rotation[joint.axis] = joint.sign * surfacePose(state, joint.control).radians
  }
}
/** A drag commits once; an intervening command cancels its stale preview. */
export function commitCG(store: AircraftStore, start: StoreSnapshot, position: readonly number[]) {
  if (store.getSnapshot() !== start) return { ok: false as const, error: 'State changed during the drag. Try again.' }
  const id = crypto.randomUUID()
  return store.dispatch({ id, type: 'SET_CG', source: 'pointer', context: { scenarioId: start.scenarioId, model: start.activeModels[0] ?? null },
    payload: { position: { frame: 'engineering', unit: 'm', x: position[0], y: position[1], z: position[2] }, provenanceId: id },
  }, { id, source: 'instructor-supplied', description: 'Exploratory CG chosen in the visual aircraft scene; not a validated mass property.', derivedFrom: [] })
}
