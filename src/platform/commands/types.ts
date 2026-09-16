import type { ModelReference } from '../evidence/types'
import type { EngineeringVector } from '../coordinates/transforms'
import type { CanonicalUnit, KnownQuantity } from '../units/types'

export type CommandSource = 'numeric-input' | 'pointer' | 'keyboard' | 'lesson' | 'system' | 'gesture'

export interface CommandContext {
  readonly scenarioId: string | null
  readonly model: ModelReference | null
}

/** The store validates envelopes and supplies timestamps in accepted-command events. */
export interface CommandEnvelope<T extends string, P> {
  readonly id: string
  readonly type: T
  readonly payload: P
  readonly source: CommandSource
  readonly context: CommandContext
}

export interface CoreCommandPayloads {
  readonly SET_MODULE_STATE: { readonly moduleId: string; readonly field: string; readonly value: KnownQuantity<CanonicalUnit> }
  readonly SET_PITCH_INERTIA: { readonly value: KnownQuantity<'kg*m^2'> }
  readonly INITIALIZE_PITCH: { readonly value: KnownQuantity<'s'> }
  readonly SET_ACTIVE_MODULES: { readonly moduleIds: readonly string[] }
  readonly SET_CG: { readonly position: EngineeringVector<'m'>; readonly provenanceId: string }
  readonly SET_AIRSPEED: { readonly value: KnownQuantity<'m/s'> }
  readonly SET_DENSITY: { readonly value: KnownQuantity<'kg/m^3'> }
  readonly SET_ALPHA: { readonly value: KnownQuantity<'rad'> }
  readonly SET_BETA: { readonly value: KnownQuantity<'rad'> }
  readonly SET_ELEVATOR: { readonly value: KnownQuantity<'rad'> }
  readonly SET_AILERON: { readonly value: KnownQuantity<'rad'> }
  readonly SET_RUDDER: { readonly value: KnownQuantity<'rad'> }
  readonly SET_FLAP: { readonly value: KnownQuantity<'rad'> }
  readonly SET_THROTTLE: { readonly value: KnownQuantity<'1'> }
  readonly RUN_SIMULATION: null
  readonly PAUSE_SIMULATION: null
  readonly STEP_SIMULATION: null
  readonly RESET_SCENARIO: { readonly scenarioId: string }
  readonly START_LESSON: { readonly lessonId: string }
  readonly GO_TO_LESSON_STAGE: { readonly stageId: string }
  readonly SUBMIT_PREDICTION: { readonly text: string }
  readonly REVEAL_LESSON: null
  readonly EXIT_LESSON: null
}

export type CoreCommand = {
  [K in keyof CoreCommandPayloads]: CommandEnvelope<K, CoreCommandPayloads[K]>
}[keyof CoreCommandPayloads]

export interface CommandDescriptor {
  readonly id: string
  readonly description: string
}
