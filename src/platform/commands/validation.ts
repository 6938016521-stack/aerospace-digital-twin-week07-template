import type { CoreCommand } from './types'
import type { CanonicalQuantityId } from '../state/quantities'
import type { CanonicalUnit } from '../units/types'

export const SCALAR_COMMANDS = {
  SET_PITCH_INERTIA: { path: 'massProperties.pitchInertia', unit: 'kg*m^2', positive: true },
  SET_AIRSPEED: { path: 'motion.airspeed', unit: 'm/s', minimum: 0 },
  SET_DENSITY: { path: 'environment.density', unit: 'kg/m^3', positive: true },
  SET_ALPHA: { path: 'motion.alpha', unit: 'rad' },
  SET_BETA: { path: 'motion.beta', unit: 'rad' },
  SET_ELEVATOR: { path: 'controls.elevatorCommanded', unit: 'rad' },
  SET_AILERON: { path: 'controls.aileronCommanded', unit: 'rad' },
  SET_RUDDER: { path: 'controls.rudderCommanded', unit: 'rad' },
  SET_FLAP: { path: 'controls.flapCommanded', unit: 'rad' },
  SET_THROTTLE: { path: 'controls.throttleCommanded', unit: '1', minimum: 0, maximum: 1 },
} as const satisfies Record<string, {
  path: CanonicalQuantityId; unit: CanonicalUnit; minimum?: number; maximum?: number; positive?: boolean
}>

Object.values(SCALAR_COMMANDS).forEach(Object.freeze)
Object.freeze(SCALAR_COMMANDS)

export type ScalarCommandType = keyof typeof SCALAR_COMMANDS
export const INPUT_COMMAND_IDS = Object.freeze([...Object.keys(SCALAR_COMMANDS), 'SET_CG', 'RESET_SCENARIO'])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateCommand(input: unknown): CoreCommand {
  if (!isRecord(input) || !nonempty(input.id) || !nonempty(input.type)) throw new Error('Command ID and type are required.')
  if (typeof input.source !== 'string' || !['numeric-input', 'pointer', 'keyboard', 'lesson', 'system', 'gesture'].includes(input.source)) throw new Error('Unknown command source.')
  if (!isRecord(input.context) || !(input.context.scenarioId === null || nonempty(input.context.scenarioId))) throw new Error('Scenario context is required.')
  const model = input.context.model
  if (model !== null && (!isRecord(model) || !nonempty(model.moduleId) || !nonempty(model.modelId) || !nonempty(model.version))) throw new Error('Model context is required.')
  const payload = input.payload
  if (Object.hasOwn(SCALAR_COMMANDS, input.type)) {
    const definition: { unit: CanonicalUnit; minimum?: number; maximum?: number; positive?: boolean } = SCALAR_COMMANDS[input.type as ScalarCommandType]
    if (!isRecord(payload) || !isRecord(payload.value)) throw new Error('A quantity payload is required.')
    const value = payload.value
    if (value.status !== 'known' || typeof value.value !== 'number' || !Number.isFinite(value.value)) throw new Error('A finite numerical value is required.')
    if (value.unit !== definition.unit) throw new Error(`Expected canonical unit ${definition.unit}.`)
    if (!nonempty(value.provenanceId)) throw new Error('A provenance reference is required.')
    if (definition.minimum !== undefined && value.value < definition.minimum) throw new Error(`Value must be at least ${definition.minimum}.`)
    if (definition.maximum !== undefined && value.value > definition.maximum) throw new Error(`Value must be at most ${definition.maximum}.`)
    if (definition.positive && value.value <= 0) throw new Error('Value must be greater than zero.')
  } else if (input.type === 'SET_MODULE_STATE' || input.type === 'INITIALIZE_PITCH') {
    if (!isRecord(payload) || !isRecord(payload.value) || payload.value.status !== 'known' || typeof payload.value.value !== 'number' || !Number.isFinite(payload.value.value) || !nonempty(payload.value.provenanceId)) throw new Error('A finite known quantity with provenance is required.')
    if (input.type === 'INITIALIZE_PITCH' && (payload.value.unit !== 's' || payload.value.value <= 0 || payload.value.value > 0.1)) throw new Error('Pitch step must be in (0, 0.1] seconds.')
    if (input.type === 'SET_MODULE_STATE' && (!nonempty(payload.moduleId) || !nonempty(payload.field))) throw new Error('Module and field are required.')
  } else if (input.type === 'SET_CG') {
    if (!isRecord(payload) || !isRecord(payload.position) || !nonempty(payload.provenanceId)) throw new Error('CG position and provenance are required.')
    if (payload.position.frame !== 'engineering' || payload.position.unit !== 'm') throw new Error('CG requires the engineering body frame in metres.')
    const position = payload.position
    if (!['x', 'y', 'z'].every((axis) => typeof position[axis] === 'number' && Number.isFinite(position[axis]))) throw new Error('All three CG coordinates must be finite.')
  } else if (input.type === 'SET_ACTIVE_MODULES') {
    if (!isRecord(payload) || !Array.isArray(payload.moduleIds) || !payload.moduleIds.every(nonempty)) throw new Error('Module IDs are required.')
  } else if (input.type === 'RESET_SCENARIO') {
    if (!isRecord(payload) || !nonempty(payload.scenarioId)) throw new Error('Reset requires a scenario ID.')
  } else if (input.type === 'START_LESSON') {
    if (!isRecord(payload) || !nonempty(payload.lessonId)) throw new Error('Lesson ID is required.')
  } else if (input.type === 'GO_TO_LESSON_STAGE') {
    if (!isRecord(payload) || !nonempty(payload.stageId)) throw new Error('Lesson stage ID is required.')
  } else if (input.type === 'SUBMIT_PREDICTION') {
    if (!isRecord(payload) || typeof payload.text !== 'string' || payload.text.trim().length === 0 || payload.text.trim().length > 2000) throw new Error('Prediction must be 1 to 2000 characters.')
  } else if (['RUN_SIMULATION', 'PAUSE_SIMULATION', 'STEP_SIMULATION', 'REVEAL_LESSON', 'EXIT_LESSON'].includes(input.type)) {
    if (payload !== null) throw new Error('Simulation command payload must be null.')
  } else {
    throw new Error(`Unknown command: ${input.type}`)
  }
  return input as unknown as CoreCommand
}
