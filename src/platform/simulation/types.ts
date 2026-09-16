import type { EngineeringValue } from '../units/types'

/** P0 describes the clock. Operational stepping and dynamics arrive later. */
export interface SimulationState {
  readonly status: 'unconfigured' | 'paused' | 'running'
  readonly elapsedTime: EngineeringValue<'s'>
  readonly timeStep: EngineeringValue<'s'>
  readonly scenarioId: string | null
}
