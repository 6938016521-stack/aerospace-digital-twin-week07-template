import type { ModelReference } from '../evidence/types'
import type { AircraftState } from '../state/types'
import type { EngineeringRequirements } from './engineering-steps'

/** A full baseline, not a partial patch that depends on a previous lesson's state. */
export interface ScenarioDefinition {
  readonly id: string
  readonly title: string
  readonly baseline: AircraftState
  readonly activeModuleIds: readonly string[]
  readonly activeModels: readonly ModelReference[]
}

export interface LessonStageDescriptor {
  readonly id: string
  readonly title: string
  readonly scenarioId: string
  readonly allowedCommandIds: readonly string[]
  readonly visibleVisualizationIds: readonly string[]
  readonly prediction: { readonly required: boolean; readonly prompt: string } | null
  readonly revealAfterPrediction: readonly string[]
  readonly takeaways: readonly string[]
  readonly claimBoundary: readonly string[]
  readonly engineeringRequirements: EngineeringRequirements
  /** Instructor guidance shown with this stage. */
  readonly instructions?: readonly string[]
  /** Work the student is asked to complete during this stage. */
  readonly studentTasks?: readonly string[]
  /** Editable module fields, expressed as `moduleId.field`. */
  readonly allowedModuleFields?: readonly string[]
}

export interface LessonDescriptor {
  readonly id: string
  readonly version: string
  readonly title: string
  readonly moduleIds: readonly string[]
  readonly scenarios: readonly ScenarioDefinition[]
  readonly stages: readonly LessonStageDescriptor[]
}
