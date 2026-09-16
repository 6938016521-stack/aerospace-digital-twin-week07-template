import { stepPitch, requirePitchReady, PITCH_DISPLAY_GUARD } from '../simulation/pitch'
import type { ModuleRuntime } from '../module-system/runtime'
import type { CoreCommand } from '../commands/types'
import { SCALAR_COMMANDS, validateCommand, nonempty, isRecord } from '../commands/validation'
import type { ScalarCommandType } from '../commands/validation'
import type { LessonDescriptor, LessonStageDescriptor, ScenarioDefinition } from '../lessons/types'
import type { ModelReference } from '../evidence/types'
import type { ProvenanceRecord } from '../provenance/types'
import { immutableCopy, appendImmutable, extendImmutable } from '../module-system/registry'
import { CANONICAL_QUANTITIES, createUnconfiguredPhysicalState } from './quantities'
import type { CanonicalQuantityId, PhysicalState } from './quantities'
import type { AircraftState } from './types'
import type { CanonicalUnit, EngineeringValue } from '../units/types'
import { quantity, unconfigured } from '../units/types'

export interface QuantityChange {
  readonly path: string
  readonly before: EngineeringValue<CanonicalUnit>
  readonly after: EngineeringValue<CanonicalUnit>
}

export interface CommandEvent {
  readonly sequence: number
  readonly timestamp: string
  readonly command: CoreCommand
  readonly provenance: ProvenanceRecord | null
  readonly changes: readonly QuantityChange[]
  readonly moduleRoots: readonly string[]
  readonly activeModuleIds: readonly string[]
  readonly activeModels: readonly ModelReference[]
  /** Lesson state after this accepted command, retained for deterministic replay. */
  readonly lesson: LessonRuntimeState | null
}

export interface LessonRuntimeState {
  readonly lessonId: string
  readonly stageId: string
  readonly prediction: string | null
  readonly revealed: boolean
  readonly experimentCount: number
}

export interface StoreSnapshot {
  readonly state: AircraftState
  readonly scenarioId: string
  readonly scenarioTitle: string
  readonly moduleRoots: readonly string[]
  readonly activeModuleIds: readonly string[]
  readonly activeModels: readonly ModelReference[]
  readonly lesson: LessonRuntimeState | null
  readonly events: readonly CommandEvent[]
}

export type DispatchResult = { readonly ok: true; readonly event: CommandEvent } | { readonly ok: false; readonly error: string }

export interface AircraftStore {
  getRuntime(): ModuleRuntime | undefined
  getSnapshot(): StoreSnapshot
  subscribe(listener: () => void): () => void
  dispatch(command: unknown, provenance?: ProvenanceRecord): DispatchResult
}

export interface StoreOptions {
  readonly runtime?: ModuleRuntime
  readonly now?: () => string
  readonly allowedCommandIds?: readonly string[]
  readonly lessons?: readonly LessonDescriptor[]
}

export function readQuantity(state: PhysicalState, path: CanonicalQuantityId): EngineeringValue<CanonicalUnit> {
  const [group, name] = path.split('.') as [keyof PhysicalState, string]
  return (state[group] as Readonly<Record<string, EngineeringValue<CanonicalUnit>>>)[name]!
}

function validateBaseline(scenario: ScenarioDefinition): void {
  if (!nonempty(scenario.id) || !nonempty(scenario.title)) throw new Error('A scenario ID and title are required.')
  const state = scenario.baseline
  if (state.simulation.scenarioId !== scenario.id) throw new Error('Baseline scenario ID must match its definition.')
  if (state.simulation.status === 'running') throw new Error('P2 cannot load a running simulation.')
  for (const [group, fields] of Object.entries(CANONICAL_QUANTITIES)) {
    for (const [name, unit] of Object.entries(fields)) {
      const value = readQuantity(state, `${group}.${name}` as CanonicalQuantityId)
      if (!value || value.unit !== unit || !['known', 'unconfigured'].includes(value.status)) throw new Error(`Invalid baseline quantity: ${group}.${name}`)
      if (value.status === 'known' && (!Number.isFinite(value.value) || !Object.hasOwn(state.provenance, value.provenanceId))) throw new Error(`Invalid baseline value/provenance: ${group}.${name}`)
    }
  }
  for (const [type, definition] of Object.entries(SCALAR_COMMANDS)) {
    const value = readQuantity(state, definition.path)
    if (value.status === 'known') validateCommand({
      id: 'baseline-validation', type, payload: { value }, source: 'system',
      context: { scenarioId: scenario.id, model: null },
    })
  }
  for (const value of [state.simulation.elapsedTime, state.simulation.timeStep]) {
    if (value.unit !== 's' || !['known', 'unconfigured'].includes(value.status)) throw new Error('Invalid baseline clock quantity.')
    if (value.status === 'known' && (!Number.isFinite(value.value) || value.value < 0 || !Object.hasOwn(state.provenance, value.provenanceId))) throw new Error('Invalid baseline clock value/provenance.')
  }
  if (state.simulation.timeStep.status === 'known' && state.simulation.timeStep.value === 0) throw new Error('A configured time step must be positive.')
}

function validateLesson(lesson: LessonDescriptor, scenarios: ReadonlyMap<string, ScenarioDefinition>): void {
  if (!nonempty(lesson.id) || !nonempty(lesson.version) || !nonempty(lesson.title)) throw new Error('Lesson ID, version and title are required.')
  const declaredScenarios = new Set<string>()
  for (const scenario of lesson.scenarios) {
    if (!nonempty(scenario.id) || declaredScenarios.has(scenario.id)) throw new Error(`Duplicate or invalid lesson scenario: ${scenario.id}`)
    if (!scenarios.has(scenario.id)) throw new Error(`Lesson scenario is not registered: ${scenario.id}`)
    declaredScenarios.add(scenario.id)
  }
  if (lesson.stages.length === 0) throw new Error(`Lesson requires at least one stage: ${lesson.id}`)
  const stageIds = new Set<string>()
  for (const stage of lesson.stages) {
    if (!nonempty(stage.id) || !nonempty(stage.title) || !nonempty(stage.scenarioId) || stageIds.has(stage.id)) throw new Error(`Duplicate or invalid lesson stage: ${stage.id}`)
    if (!scenarios.has(stage.scenarioId)) throw new Error(`Lesson stage scenario is not registered: ${stage.scenarioId}`)
    if (!Array.isArray(stage.allowedCommandIds) || !stage.allowedCommandIds.every(nonempty)) throw new Error(`Invalid lesson command allowlist: ${stage.id}`)
    if (stage.allowedModuleFields !== undefined && !Array.isArray(stage.allowedModuleFields)) throw new Error(`Invalid lesson module field restrictions: ${stage.id}`)
    for (const field of stage.allowedModuleFields ?? []) {
      if (!nonempty(field) || field.split('.').length !== 2 || field.split('.').some((part) => !nonempty(part))) throw new Error(`Invalid lesson module field restriction: ${field}`)
    }
    stageIds.add(stage.id)
  }
}

function sameEngineeringValue(before: EngineeringValue<CanonicalUnit>, after: EngineeringValue<CanonicalUnit>): boolean {
  return before.status === after.status && before.unit === after.unit &&
    (before.status === 'unconfigured' || after.status === 'unconfigured' || before.value === after.value)
}

function hasSubstantiveEngineeringChange(before: AircraftState, after: AircraftState): boolean {
  return differences(before, after).some((change) => sameEngineeringValue(change.before, change.after) === false)
}

function isSubstantiveLessonExperiment(command: CoreCommand, before: AircraftState, after: AircraftState): boolean {
  if (command.type === 'STEP_SIMULATION') return hasSubstantiveEngineeringChange(before, after)
  if (Object.hasOwn(SCALAR_COMMANDS, command.type)) {
    const path = SCALAR_COMMANDS[command.type as ScalarCommandType].path
    return !sameEngineeringValue(readQuantity(before, path), readQuantity(after, path))
  }
  if (command.type === 'SET_MODULE_STATE') {
    const previous = before.modules[command.payload.moduleId]?.[command.payload.field]
    const current = after.modules[command.payload.moduleId]?.[command.payload.field]
    return previous === undefined || current === undefined || !sameEngineeringValue(previous, current)
  }
  if (command.type === 'SET_CG') return ['cgX', 'cgY', 'cgZ'].some((field) =>
    !sameEngineeringValue(before.massProperties[field as 'cgX' | 'cgY' | 'cgZ'], after.massProperties[field as 'cgX' | 'cgY' | 'cgZ']))
  if (command.type === 'INITIALIZE_PITCH') return !sameEngineeringValue(before.simulation.timeStep, after.simulation.timeStep)
  return false
}

function differences(before: AircraftState, after: AircraftState): QuantityChange[] {
  const changes: QuantityChange[] = []
  for (const [group, fields] of Object.entries(CANONICAL_QUANTITIES)) {
    for (const name of Object.keys(fields)) {
      const path = `${group}.${name}` as CanonicalQuantityId
      const oldValue = readQuantity(before, path)
      const newValue = readQuantity(after, path)
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes.push({ path, before: oldValue, after: newValue })
    }
  }
  for (const group of ['modules', 'outputs'] as const) {
    for (const owner of new Set([...Object.keys(before[group]), ...Object.keys(after[group])])) {
      for (const name of new Set([...Object.keys(before[group][owner] ?? {}), ...Object.keys(after[group][owner] ?? {})])) {
        const oldValue = before[group][owner]?.[name]
        const newValue = after[group][owner]?.[name]
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes.push({ path: `${group}.${owner}.${name}`, before: oldValue ?? unconfigured(newValue!.unit, 'Module value absent.'), after: newValue ?? unconfigured(oldValue!.unit, 'Module value removed.') })
      }
    }
  }
  for (const field of ['elapsedTime', 'timeStep'] as const) {
    if (JSON.stringify(before.simulation[field]) !== JSON.stringify(after.simulation[field])) changes.push({ path: `simulation.${field}`, before: before.simulation[field], after: after.simulation[field] })
  }
  return changes
}

export function createAircraftStore(
  definitions: readonly ScenarioDefinition[],
  initialScenarioId: string,
  options: StoreOptions = {},
): AircraftStore {
  const scenarios = new Map<string, ScenarioDefinition>()
  for (const definition of definitions) {
    validateBaseline(definition)
    if (scenarios.has(definition.id)) throw new Error(`Duplicate scenario: ${definition.id}`)
    scenarios.set(definition.id, immutableCopy(definition))
  }
  const initial = scenarios.get(initialScenarioId)
  if (!initial) throw new Error(`Unknown initial scenario: ${initialScenarioId}`)
  const lessons = new Map<string, LessonDescriptor>()
  for (const lesson of options.lessons ?? []) {
    validateLesson(lesson, scenarios)
    if (lessons.has(lesson.id)) throw new Error(`Duplicate lesson: ${lesson.id}`)
    lessons.set(lesson.id, immutableCopy(lesson))
  }
  const allowed = options.allowedCommandIds ? new Set(options.allowedCommandIds) : null
  const now = options.now ?? (() => new Date().toISOString())
  const ids = new Set<string>()
  const listeners = new Set<() => void>()
  const initialWorkspace = immutableCopy({
    state: options.runtime ? options.runtime.evaluate(initial.baseline, initial.activeModuleIds).state : initial.baseline, scenarioId: initial.id, scenarioTitle: initial.title,
    moduleRoots: initial.activeModuleIds,
    activeModuleIds: options.runtime ? options.runtime.resolve(initial.activeModuleIds) : initial.activeModuleIds, activeModels: initial.activeModels,
  })
  let snapshot: StoreSnapshot = immutableCopy({
    ...initialWorkspace, lesson: null, events: [],
  })

  return {
    getRuntime: () => options.runtime,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispatch(input, suppliedProvenance) {
      let nextSnapshot: StoreSnapshot
      let event: CommandEvent
      try {
        const command = immutableCopy(validateCommand(input))
        if (ids.has(command.id)) throw new Error('This command ID has already been accepted.')
        if (allowed && !allowed.has(command.type)) throw new Error('This command is not allowed in the current workspace.')
        if (command.context.scenarioId !== snapshot.scenarioId) throw new Error('Stale scenario context; refresh before applying the command.')
        const model = command.context.model
        if (model ? !snapshot.activeModels.some((active) => active.moduleId === model.moduleId && active.modelId === model.modelId && active.version === model.version) : snapshot.activeModels.length > 0) throw new Error('Stale or missing model context.')
        let nextState = snapshot.state
        let scenario = scenarios.get(snapshot.scenarioId)!
        let moduleIds = snapshot.moduleRoots
        let moduleRoots = snapshot.moduleRoots
        let provenance: ProvenanceRecord | null = null
        let lesson = snapshot.lesson
        let skipRuntime = false
        const isLessonCommand = ['START_LESSON', 'GO_TO_LESSON_STAGE', 'SUBMIT_PREDICTION', 'REVEAL_LESSON', 'EXIT_LESSON'].includes(command.type)
        const currentStage = (): LessonStageDescriptor => {
          if (!lesson) throw new Error('No lesson is active.')
          const descriptor = lessons.get(lesson.lessonId)
          const stage = descriptor?.stages.find((entry) => entry.id === lesson!.stageId)
          if (!stage) throw new Error('Active lesson stage is unavailable.')
          return stage
        }
        if (lesson && !isLessonCommand) {
          const stage = currentStage()
          if (command.type === 'SET_ACTIVE_MODULES') throw new Error('Module selection is locked while a lesson is active.')
          if (command.type === 'RESET_SCENARIO' && command.payload.scenarioId !== stage.scenarioId) throw new Error('A lesson can only reset its current scenario.')
          if (command.type !== 'PAUSE_SIMULATION' && command.type !== 'RESET_SCENARIO') {
            if (stage.prediction?.required && lesson.prediction === null) throw new Error('Submit the required prediction before changing the engineering state.')
            if (!stage.allowedCommandIds.includes(command.type)) throw new Error('This command is not allowed in the current lesson stage.')
            if (command.type === 'SET_MODULE_STATE' && !(stage.allowedModuleFields ?? []).includes(`${command.payload.moduleId}.${command.payload.field}`)) throw new Error('This module field is not allowed in the current lesson stage.')
          }
        } else if (!lesson && isLessonCommand && command.type !== 'START_LESSON') {
          throw new Error('No lesson is active.')
        }
        if (command.type === 'START_LESSON') {
          if (lesson) throw new Error('A lesson is already active.')
          const descriptor = lessons.get(command.payload.lessonId)
          if (!descriptor) throw new Error('Unknown lesson.')
          const stage = descriptor.stages[0]!
          scenario = scenarios.get(stage.scenarioId)!
          nextState = scenario.baseline
          moduleIds = scenario.activeModuleIds
          moduleRoots = scenario.activeModuleIds
          lesson = { lessonId: descriptor.id, stageId: stage.id, prediction: null, revealed: false, experimentCount: 0 }
        } else if (command.type === 'GO_TO_LESSON_STAGE') {
          const descriptor = lessons.get(lesson!.lessonId)!
          const currentIndex = descriptor.stages.findIndex((stage) => stage.id === lesson!.stageId)
          const targetIndex = descriptor.stages.findIndex((stage) => stage.id === command.payload.stageId)
          if (targetIndex < 0 || Math.abs(targetIndex - currentIndex) !== 1) throw new Error('Lesson stages must be visited one adjacent stage at a time.')
          if (targetIndex > currentIndex && !lesson!.revealed) throw new Error('Reveal the current lesson stage before moving forward.')
          const target = descriptor.stages[targetIndex]!
          scenario = scenarios.get(target.scenarioId)!
          nextState = scenario.baseline
          moduleIds = scenario.activeModuleIds
          moduleRoots = scenario.activeModuleIds
          lesson = { lessonId: descriptor.id, stageId: target.id, prediction: null, revealed: false, experimentCount: 0 }
        } else if (command.type === 'SUBMIT_PREDICTION') {
          if (lesson!.prediction !== null) throw new Error('The prediction is immutable until the stage is reset.')
          lesson = { ...lesson!, prediction: command.payload.text.trim() }
          moduleIds = snapshot.activeModuleIds
          skipRuntime = true
        } else if (command.type === 'REVEAL_LESSON') {
          const stage = currentStage()
          if (lesson!.revealed) throw new Error('This lesson stage has already been revealed.')
          if (stage.prediction?.required && lesson!.prediction === null) throw new Error('Submit the required prediction before revealing this stage.')
          if (lesson!.experimentCount === 0) throw new Error('Make a permitted engineering change before revealing this stage.')
          lesson = { ...lesson!, revealed: true }
          moduleIds = snapshot.activeModuleIds
          skipRuntime = true
        } else if (command.type === 'EXIT_LESSON') {
          nextState = initialWorkspace.state
          scenario = initial
          moduleRoots = initialWorkspace.moduleRoots
          moduleIds = initialWorkspace.activeModuleIds
          lesson = null
          skipRuntime = true
        } else if (command.type === 'RESET_SCENARIO') {
          const target = scenarios.get(command.payload.scenarioId)
          if (!target) throw new Error('Unknown reset scenario.')
          scenario = target
          nextState = target.baseline
          moduleIds = target.activeModuleIds
          moduleRoots = target.activeModuleIds
          if (lesson) {
            lesson = { ...lesson, prediction: null, revealed: false, experimentCount: 0 }
          }
        } else if (command.type === 'SET_ACTIVE_MODULES') {
          if (!options.runtime) throw new Error('Module runtime unavailable.')
          moduleIds = command.payload.moduleIds
          moduleRoots = command.payload.moduleIds
        } else if (['RUN_SIMULATION', 'PAUSE_SIMULATION', 'STEP_SIMULATION'].includes(command.type)) {
          if (!options.runtime || snapshot.state.simulation.status === 'unconfigured') throw new Error('Simulation runtime is not configured. Initialize pitch first.')
          if (command.type === 'RUN_SIMULATION') {
            const ready = requirePitchReady(snapshot.state)
            if (Math.abs(ready.pitch.value) >= PITCH_DISPLAY_GUARD) throw new Error('30° display guard reached. Reinitialize pitch.')
            nextState = { ...nextState, simulation: { ...nextState.simulation, status: 'running' } }
          } else if (command.type === 'PAUSE_SIMULATION') nextState = { ...nextState, simulation: { ...nextState.simulation, status: 'paused' } }
        } else {
          const provenanceId = command.type === 'SET_CG' ? command.payload.provenanceId :
            'value' in command.payload! ? command.payload!.value.provenanceId : ''
          const existing = snapshot.state.provenance[provenanceId]
          provenance = suppliedProvenance ?? existing ?? null
          if (!provenance || provenance.id !== provenanceId || !nonempty(provenance.description) || !Array.isArray(provenance.derivedFrom)) throw new Error('The quantity must resolve to a described provenance record.')
          if (!['instructor-supplied', 'reference-aircraft', 'student-entered', 'student-model', 'measured', 'computed', 'imported-dataset', 'ai-assisted', 'external-source'].includes(provenance.source)) throw new Error('Unknown provenance source.')
          if (provenance.derivedFrom.some((id) => !Object.hasOwn(snapshot.state.provenance, id))) throw new Error('Provenance refers to a missing source.')
          if (existing && JSON.stringify(existing) !== JSON.stringify(provenance)) throw new Error('Existing provenance cannot be overwritten.')
          let moduleState = snapshot.state.modules
          const changes: Record<string, Record<string, EngineeringValue<CanonicalUnit>>> = {}
          if (command.type === 'SET_MODULE_STATE') {
            const descriptor = options.runtime?.list().find((entry) => entry.id === command.payload.moduleId)
            const field = descriptor?.stateExtensions.find((entry) => entry.path === `modules.${command.payload.moduleId}.${command.payload.field}` && entry.editable)
            if (!snapshot.activeModuleIds.includes(command.payload.moduleId) || !field || field.unit !== command.payload.value.unit) throw new Error('Inactive module, noneditable field or incompatible unit.')
            moduleState = { ...snapshot.state.modules, [command.payload.moduleId]: { ...snapshot.state.modules[command.payload.moduleId], [command.payload.field]: command.payload.value } }
          } else if (command.type === 'INITIALIZE_PITCH') {
            changes.motion = { ...snapshot.state.motion, pitch: quantity(0, 'rad', provenanceId), pitchRate: quantity(0, 'rad/s', provenanceId) }
          } else if (command.type === 'SET_CG') {
            changes.massProperties = {
              ...snapshot.state.massProperties,
              cgX: quantity(command.payload.position.x, 'm', provenanceId),
              cgY: quantity(command.payload.position.y, 'm', provenanceId),
              cgZ: quantity(command.payload.position.z, 'm', provenanceId),
            }
          } else if (Object.hasOwn(SCALAR_COMMANDS, command.type)) {
            const [group, name] = SCALAR_COMMANDS[command.type as ScalarCommandType].path.split('.') as [keyof PhysicalState, string]
            const scalar = command as Extract<CoreCommand, { type: ScalarCommandType }>
            changes[group] = { ...snapshot.state[group], [name]: scalar.payload.value }
          }
          nextState = {
            ...snapshot.state, ...changes, modules: moduleState,
            simulation: command.type === 'INITIALIZE_PITCH' ? { ...snapshot.state.simulation, status: 'paused', elapsedTime: quantity(0, 's', provenanceId), timeStep: command.payload.value } : snapshot.state.simulation,
            loads: createUnconfiguredPhysicalState().loads, outputs: {}, evidence: [],
            provenance: extendImmutable(snapshot.state.provenance, { [provenanceId]: provenance }),
          }
        }
        if (options.runtime && !skipRuntime) {
          const evaluated = options.runtime.evaluate(nextState, moduleIds)
          nextState = evaluated.state
          moduleIds = evaluated.activeModuleIds
        }
        if (!skipRuntime && command.type === 'STEP_SIMULATION') nextState = stepPitch(nextState, command.id)
        else if (!skipRuntime && !['RUN_SIMULATION', 'PAUSE_SIMULATION', 'RESET_SCENARIO'].includes(command.type) && nextState.simulation.status === 'running') nextState = { ...nextState, simulation: { ...nextState.simulation, status: 'paused' } }
        if (lesson && snapshot.lesson && !isLessonCommand && command.type !== 'RESET_SCENARIO' && isSubstantiveLessonExperiment(command, snapshot.state, nextState)) {
          lesson = { ...lesson, experimentCount: lesson.experimentCount + 1 }
        }
        const timestamp = now()
        if (!nonempty(timestamp) || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) throw new Error('An ISO timestamp is required for the event log.')
        event = immutableCopy({
          sequence: snapshot.events.length + 1, timestamp, command, provenance,
          changes: differences(snapshot.state, nextState),
          moduleRoots, activeModuleIds: moduleIds, activeModels: scenario.activeModels, lesson,
        })
        nextSnapshot = immutableCopy({
          state: nextState, scenarioId: scenario.id, scenarioTitle: scenario.title,
          moduleRoots, activeModuleIds: moduleIds, activeModels: scenario.activeModels, lesson,
          events: appendImmutable(snapshot.events, event),
        })
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Invalid command.' }
      }
      snapshot = nextSnapshot
      ids.add(event.command.id)
      // Notifications occur only after committing the immutable snapshot.
      listeners.forEach((listener) => listener())
      return { ok: true, event }
    },
  }
}

/** Replays trusted in-memory events; import/export schema validation is deferred. */
export function replayEvents(
  definitions: readonly ScenarioDefinition[], initialScenarioId: string,
  events: readonly CommandEvent[], options: Omit<StoreOptions, 'now'> = {},
): AircraftStore {
  let timestamp = ''
  const store = createAircraftStore(definitions, initialScenarioId, { ...options, now: () => timestamp })
  for (const event of events) {
    if (!isRecord(event) || event.sequence !== store.getSnapshot().events.length + 1) throw new Error('Invalid event sequence.')
    timestamp = event.timestamp
    const result = store.dispatch(event.command, event.provenance ?? undefined)
    if (!result.ok) throw new Error(`Replay rejected event ${event.sequence}: ${result.error}`)
    if (JSON.stringify(result.event) !== JSON.stringify(event)) throw new Error(`Replay diverged at event ${event.sequence}.`)
  }
  return store
}
