import { createUnconfiguredAircraftState, quantity } from '../../platform'
import type { ScenarioDefinition } from '../../platform'
const empty = createUnconfiguredAircraftState()
const id = 'c2-example-source'
const q = <U extends Parameters<typeof quantity>[1]>(value: number, unit: U) => quantity(value, unit, id)
export const pitchScenario: ScenarioDefinition = {
  id: 'c2-pitch-example', title: 'C2 prescribed-force example', activeModuleIds: ['controls'], activeModels: [],
  baseline: { ...empty, aircraftId: 'aerolab-01',
    massProperties: { ...empty.massProperties, pitchInertia: q(5000, 'kg*m^2'), cgX: q(0, 'm'), cgY: q(0, 'm'), cgZ: q(0, 'm') },
    motion: { ...empty.motion, pitch: q(0, 'rad'), pitchRate: q(0, 'rad/s') },
    modules: { controls: { requestedAcceleration: q(0.12, 'rad/s^2'), competingMoment: q(-750, 'N*m'), tailStation: q(-3, 'm'), tailForce: q(450, 'N') } },
    simulation: { status: 'paused', elapsedTime: q(0, 's'), timeStep: q(0.02, 's'), scenarioId: 'c2-pitch-example' },
    provenance: { [id]: { id, source: 'instructor-supplied', description: 'C2 supplied regression: Iy=5000, target=0.12, competing=-750. Added illustrative choices CG=(0,0,0), tail x=-3 m, Fz=450 N, zero pitch/rate and dt=0.02 s. Not calibrated aircraft data.', derivedFrom: [] } },
  },
}
