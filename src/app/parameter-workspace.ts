import { authorityScenario } from '../modules/controls/authority-scenario'
import { elevatorScenario } from '../modules/controls/elevator-scenario'
import { pitchScenario } from '../modules/controls/pitch-scenario'
import { createBundledRuntime } from './bundled-modules'
import { AIRCRAFT_ASSET } from '../scene/aircraft/definition'
import { createUnconfiguredAircraftState } from '../platform/state/types'
import { createAircraftStore } from '../platform/state/store'
import type { ScenarioDefinition } from '../platform/lessons/types'
import { week06Lesson } from '../modules/controls/week06-lesson'

const empty = createUnconfiguredAircraftState()

export const parameterScenario: ScenarioDefinition = {
  id: 'parameter-workspace', title: 'Parameter workspace',
  baseline: { ...empty, aircraftId: AIRCRAFT_ASSET.id, simulation: { ...empty.simulation, scenarioId: 'parameter-workspace' } },
  activeModuleIds: [], activeModels: [],
}

export function createParameterStore() {
  return createAircraftStore([parameterScenario, pitchScenario, elevatorScenario, authorityScenario, ...week06Lesson.scenarios], parameterScenario.id, { runtime: createBundledRuntime(), lessons: [week06Lesson] })
}
