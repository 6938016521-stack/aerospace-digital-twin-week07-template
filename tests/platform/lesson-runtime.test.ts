import { describe, expect, it } from 'vitest'
import { createAircraftStore, createModuleRuntime, createUnconfiguredAircraftState, quantity, replayEvents } from '../../src/platform'
import type { CommandSource, LessonDescriptor, ModulePackage, ProvenanceRecord, ScenarioDefinition } from '../../src/platform'

const provenance: ProvenanceRecord = { id: 'lesson-source', source: 'instructor-supplied', description: 'Lesson fixture source.', derivedFrom: [] }
const now = () => '2026-09-15T01:00:00.000Z'

function scenario(id: string): ScenarioDefinition {
  const empty = createUnconfiguredAircraftState()
  return {
    id, title: id, activeModuleIds: ['controls'], activeModels: [],
    baseline: {
      ...empty, simulation: { ...empty.simulation, scenarioId: id },
      motion: { ...empty.motion, airspeed: quantity(10, 'm/s', provenance.id) },
      modules: { controls: { gain: quantity(1, 'm', provenance.id) } },
      provenance: { [provenance.id]: provenance },
    },
  }
}

const first = scenario('lesson-first')
const second = scenario('lesson-second')
const workspace = scenario('workspace')
const lesson: LessonDescriptor = {
  id: 'lesson', version: '1', title: 'Lesson', moduleIds: ['controls'], scenarios: [first, second],
  stages: [
    { id: 'observe', title: 'Observe', scenarioId: first.id, allowedCommandIds: ['SET_AIRSPEED', 'RESET_SCENARIO', 'SET_MODULE_STATE'], allowedModuleFields: ['controls.gain'], visibleVisualizationIds: [], prediction: { required: true, prompt: 'Predict.' }, revealAfterPrediction: [], takeaways: [], claimBoundary: [], engineeringRequirements: {} },
    { id: 'explain', title: 'Explain', scenarioId: second.id, allowedCommandIds: ['SET_AIRSPEED'], visibleVisualizationIds: [], prediction: null, revealAfterPrediction: [], takeaways: [], claimBoundary: [], engineeringRequirements: {} },
  ],
}

function command(type: string, payload: unknown, id: string, source: CommandSource = 'numeric-input', scenarioId = 'workspace') {
  return { id, type, payload, source, context: { scenarioId, model: null } }
}

function start(store = createAircraftStore([workspace, first, second], workspace.id, { lessons: [lesson], now })) {
  expect(store.dispatch(command('START_LESSON', { lessonId: lesson.id }, 'start')).ok).toBe(true)
  return store
}

function runtimeWithCounter(counter: { value: number }) {
  const runtime = createModuleRuntime()
  const dependency: ModulePackage = {
    descriptor: {
      id: 'dependency', version: '1.0.0', title: 'Dependency', description: 'Lesson runtime dependency.', implementation: 'provided', requires: { platform: '^0.1.0', modules: [] },
      stateExtensions: [], inputs: [], outputs: [], commands: [], modelSlots: [], visualizationIds: [], lessonIds: [], verificationCaseIds: [], evidenceRuleIds: [],
    }, evaluate: () => ({ outputs: {}, extensions: {} }), visualizations: [], verification: [],
  }
  const controls: ModulePackage = {
    descriptor: {
      id: 'controls', version: '1.0.0', title: 'Controls', description: 'Editable lesson control.', implementation: 'provided', requires: { platform: '^0.1.0', modules: [{ id: 'dependency', versionRange: '^1.0.0' }] },
      stateExtensions: [{ path: 'modules.controls.gain', label: 'Gain', unit: 'm', editable: true }], inputs: [], outputs: [{ id: 'outputs.controls.marker', label: 'Marker', unit: 'm' }], commands: [], modelSlots: [], visualizationIds: [], lessonIds: [], verificationCaseIds: [], evidenceRuleIds: [],
    }, evaluate: (state) => {
      counter.value += 1
      const gain = state.modules.controls?.gain
      if (!gain) throw new Error('Fixture gain missing.')
      return { outputs: { 'outputs.controls.marker': gain }, extensions: { 'modules.controls.gain': gain } }
    }, visualizations: [], verification: [],
  }
  runtime.install(dependency)
  runtime.install(controls)
  return runtime
}

describe('lesson runtime', () => {
  it('starts from the curated stage baseline and rejects all input sources before a required prediction', () => {
    const store = start()
    expect(store.getSnapshot().lesson).toEqual({ lessonId: lesson.id, stageId: 'observe', prediction: null, revealed: false, experimentCount: 0 })
    expect(store.getSnapshot().state).toEqual(first.baseline)
    for (const [index, source] of (['numeric-input', 'pointer', 'keyboard', 'lesson', 'system', 'gesture'] as const).entries()) {
      const before = store.getSnapshot()
      expect(store.dispatch(command('SET_AIRSPEED', { value: quantity(20, 'm/s', provenance.id) }, `blocked-${index}`, source, first.id)).ok).toBe(false)
      expect(store.getSnapshot()).toBe(before)
    }
  })

  it('enforces module fields and lesson scenario/module boundaries regardless of payload', () => {
    const store = start()
    store.dispatch(command('SUBMIT_PREDICTION', { text: '  It will increase. ' }, 'prediction', 'lesson', first.id))
    expect(store.getSnapshot().lesson?.prediction).toBe('It will increase.')
    expect(store.dispatch(command('SET_MODULE_STATE', { moduleId: 'controls', field: 'other', value: quantity(2, 'm', provenance.id) }, 'module-bypass', 'system', first.id)).ok).toBe(false)
    expect(store.dispatch(command('SET_ACTIVE_MODULES', { moduleIds: [] }, 'modules', 'lesson', first.id)).ok).toBe(false)
    expect(store.dispatch(command('RESET_SCENARIO', { scenarioId: second.id }, 'other-scenario', 'lesson', first.id)).ok).toBe(false)
    expect(store.dispatch(command('SET_MODULE_STATE', { moduleId: 'controls', field: 'gain', value: quantity(2, 'm', provenance.id) }, 'allowed-module', 'pointer', first.id)).ok).toBe(false)
  })

  it('requires a nonblank immutable prediction and a substantive experiment before reveal or forward travel', () => {
    const store = start()
    const before = store.getSnapshot()
    expect(store.dispatch(command('SUBMIT_PREDICTION', { text: '   ' }, 'blank', 'lesson', first.id)).ok).toBe(false)
    expect(store.getSnapshot()).toBe(before)
    expect(store.dispatch(command('REVEAL_LESSON', null, 'early-reveal', 'lesson', first.id)).ok).toBe(false)
    expect(store.dispatch(command('GO_TO_LESSON_STAGE', { stageId: 'explain' }, 'early-forward', 'lesson', first.id)).ok).toBe(false)
    const baselineState = store.getSnapshot().state
    expect(store.dispatch(command('SUBMIT_PREDICTION', { text: 'It changes.' }, 'prediction', 'lesson', first.id)).ok).toBe(true)
    expect(store.getSnapshot().state).toBe(baselineState)
    expect(store.dispatch(command('SUBMIT_PREDICTION', { text: 'Changed answer.' }, 'overwrite', 'lesson', first.id)).ok).toBe(false)
    expect(store.dispatch(command('SET_AIRSPEED', { value: quantity(10, 'm/s', provenance.id) }, 'no-op', 'numeric-input', first.id)).ok).toBe(true)
    expect(store.getSnapshot().lesson?.experimentCount).toBe(0)
    expect(store.dispatch(command('REVEAL_LESSON', null, 'still-early', 'lesson', first.id)).ok).toBe(false)
    expect(store.dispatch(command('SET_AIRSPEED', { value: quantity(20, 'm/s', provenance.id) }, 'experiment', 'numeric-input', first.id)).ok).toBe(true)
    expect(store.getSnapshot().lesson?.experimentCount).toBe(1)
    expect(store.dispatch(command('REVEAL_LESSON', null, 'reveal', 'lesson', first.id)).ok).toBe(true)
    expect(store.dispatch(command('GO_TO_LESSON_STAGE', { stageId: 'explain' }, 'forward', 'lesson', first.id)).ok).toBe(true)
  })

  it('resets a stage, replays lesson events, supports adjacent back navigation, and exits to the workspace baseline', () => {
    const store = start()
    store.dispatch(command('SUBMIT_PREDICTION', { text: 'It changes.' }, 'prediction', 'lesson', first.id))
    store.dispatch(command('SET_AIRSPEED', { value: quantity(20, 'm/s', provenance.id) }, 'experiment', 'numeric-input', first.id))
    store.dispatch(command('REVEAL_LESSON', null, 'reveal', 'lesson', first.id))
    store.dispatch(command('GO_TO_LESSON_STAGE', { stageId: 'explain' }, 'forward', 'lesson', first.id))
    expect(store.dispatch(command('GO_TO_LESSON_STAGE', { stageId: 'observe' }, 'back', 'lesson', second.id)).ok).toBe(true)
    expect(store.getSnapshot().lesson).toEqual({ lessonId: lesson.id, stageId: 'observe', prediction: null, revealed: false, experimentCount: 0 })
    const reset = command('RESET_SCENARIO', { scenarioId: first.id }, 'reset', 'lesson', first.id)
    expect(store.dispatch(reset).ok).toBe(true)
    const replay = replayEvents([workspace, first, second], workspace.id, store.getSnapshot().events, { lessons: [lesson] })
    expect(replay.getSnapshot()).toEqual(store.getSnapshot())
    expect(store.dispatch(command('EXIT_LESSON', null, 'exit', 'lesson', first.id)).ok).toBe(true)
    expect(store.getSnapshot().lesson).toBeNull()
    expect(store.getSnapshot().state).toEqual(workspace.baseline)
  })

  it('evaluates each loaded baseline, permits allowed fields, and preserves the resolved runtime state on pure lesson commands', () => {
    const evaluations = { value: 0 }
    const runtime = runtimeWithCounter(evaluations)
    const store = createAircraftStore([workspace, first, second], workspace.id, { lessons: [lesson], now, runtime })
    expect(evaluations.value).toBe(1)
    expect(store.dispatch(command('START_LESSON', { lessonId: lesson.id }, 'start-runtime')).ok).toBe(true)
    expect(evaluations.value).toBe(2)
    expect(store.getSnapshot().activeModuleIds).toEqual(['dependency', 'controls'])
    expect(store.getSnapshot().state.outputs.controls?.marker).toEqual(quantity(1, 'm', provenance.id))
    const loadedState = store.getSnapshot().state
    const activeIds = store.getSnapshot().activeModuleIds
    expect(store.dispatch(command('SUBMIT_PREDICTION', { text: 'It changes.' }, 'runtime-prediction', 'lesson', first.id)).ok).toBe(true)
    expect(evaluations.value).toBe(2)
    expect(store.getSnapshot().state).toBe(loadedState)
    expect(store.getSnapshot().activeModuleIds).toEqual(activeIds)
    expect(store.dispatch(command('SET_MODULE_STATE', { moduleId: 'controls', field: 'gain', value: quantity(2, 'm', provenance.id) }, 'runtime-edit', 'pointer', first.id)).ok).toBe(true)
    expect(evaluations.value).toBe(3)
    expect(store.getSnapshot().lesson?.experimentCount).toBe(1)
    expect(store.dispatch(command('REVEAL_LESSON', null, 'runtime-reveal', 'lesson', first.id)).ok).toBe(true)
    expect(evaluations.value).toBe(3)
    expect(store.getSnapshot().activeModuleIds).toEqual(activeIds)
    expect(store.dispatch(command('GO_TO_LESSON_STAGE', { stageId: 'explain' }, 'runtime-forward', 'lesson', first.id)).ok).toBe(true)
    expect(evaluations.value).toBe(4)
    expect(store.getSnapshot().state.outputs.controls?.marker).toEqual(quantity(1, 'm', provenance.id))
    expect(store.dispatch(command('RESET_SCENARIO', { scenarioId: second.id }, 'runtime-reset', 'lesson', second.id)).ok).toBe(true)
    expect(evaluations.value).toBe(5)
    expect(store.getSnapshot().lesson).toEqual({ lessonId: lesson.id, stageId: 'explain', prediction: null, revealed: false, experimentCount: 0 })
    expect(store.getSnapshot().state.outputs.controls?.marker).toEqual(quantity(1, 'm', provenance.id))
  })
})
