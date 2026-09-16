import type { ModelResultEvidence } from '../evidence/types'
import type { ProvenanceRecord } from '../provenance/types'
import type { SimulationState } from '../simulation/types'
import type { CanonicalUnit, EngineeringValue } from '../units/types'
import { unconfigured } from '../units/types'
import { createUnconfiguredPhysicalState } from './quantities'
import type { PhysicalState } from './quantities'

export type ModuleQuantityState = Readonly<Record<string, EngineeringValue<CanonicalUnit>>>

export type AircraftState = PhysicalState & {
  readonly aircraftId: string | null
  readonly modules: Readonly<Record<string, ModuleQuantityState>>
  readonly outputs: Readonly<Record<string, ModuleQuantityState>>
  readonly simulation: SimulationState
  readonly provenance: Readonly<Record<string, ProvenanceRecord>>
  readonly evidence: readonly ModelResultEvidence[]
}

/** An immutable P0 snapshot, not a store or runtime initializer. */
export function createUnconfiguredAircraftState(): AircraftState {
  return Object.freeze({
    ...createUnconfiguredPhysicalState(),
    aircraftId: null,
    modules: Object.freeze({}),
    outputs: Object.freeze({}),
    simulation: Object.freeze({
      status: 'unconfigured',
      elapsedTime: unconfigured('s'),
      timeStep: unconfigured('s'),
      scenarioId: null,
    }),
    provenance: Object.freeze({}),
    evidence: Object.freeze([]),
  })
}
