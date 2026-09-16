import { describe, expect, it, vi } from 'vitest'
import { createAircraftStore, createUnconfiguredAircraftState, quantity, replayEvents } from '../../src/platform'
import type { ScenarioDefinition, CoreCommand, ProvenanceRecord } from '../../src/platform'
import type { ScalarCommandType } from '../../src/platform/commands/validation'
import { SCALAR_COMMANDS } from '../../src/platform/commands/validation'
import { readQuantity } from '../../src/platform/state/store'

const source: ProvenanceRecord = { id: 'synthetic', source: 'instructor-supplied', description: 'Synthetic test data only.', derivedFrom: [] }
const now = () => '2026-09-15T01:00:00.000Z'

function scenario(id = 'test'): ScenarioDefinition {
  const empty = createUnconfiguredAircraftState()
  return {
    id, title: 'Synthetic scenario', activeModuleIds: ['synthetic-module'], activeModels: [],
    baseline: {
      ...empty, aircraftId: 'synthetic-aircraft',
      simulation: { ...empty.simulation, scenarioId: id },
      massProperties: { ...empty.massProperties, cgX: quantity(1, 'm', source.id) },
      modules: { 'synthetic-module': { sample: quantity(2, 'm', source.id) } },
      outputs: { 'synthetic-module': { sample: quantity(7, 'N', source.id) } },
      loads: { ...empty.loads, lift: quantity(7, 'N', source.id) },
      provenance: { [source.id]: source },
    },
  }
}

function scalar(type: ScalarCommandType = 'SET_AIRSPEED', value = 20, id = 'command-1'): CoreCommand {
  return {
    id, type, payload: { value: quantity(value, SCALAR_COMMANDS[type].unit, source.id) },
    source: 'numeric-input', context: { scenarioId: 'test', model: null },
  } as CoreCommand
}

function reset(target = 'test', id = 'reset'): CoreCommand {
  return { id, type: 'RESET_SCENARIO', payload: { scenarioId: target }, source: 'numeric-input', context: { scenarioId: 'test', model: null } }
}

describe('canonical state store', () => {
  it.each(Object.keys(SCALAR_COMMANDS) as ScalarCommandType[])('updates %s at its declared path with provenance', (type) => {
    const store = createAircraftStore([scenario()], 'test', { now })
    const result = store.dispatch(scalar(type, type === 'SET_THROTTLE' ? 0.5 : 2))
    expect(result.ok).toBe(true)
    expect(readQuantity(store.getSnapshot().state, SCALAR_COMMANDS[type].path)).toEqual(
      quantity(type === 'SET_THROTTLE' ? 0.5 : 2, SCALAR_COMMANDS[type].unit, source.id),
    )
    expect(store.getSnapshot().events[0]?.timestamp).toBe(now())
    expect(store.getSnapshot().events[0]?.provenance).toEqual(source)
    expect(store.getSnapshot().state.outputs).toEqual({})
    expect(store.getSnapshot().state.loads.lift.status).toBe('unconfigured')
  })

  it('keeps commanded deflection distinct from delivered physical position', () => {
    const store = createAircraftStore([scenario()], 'test', { now })
    store.dispatch(scalar('SET_ELEVATOR', 0.2))
    expect(store.getSnapshot().state.controls.elevatorCommanded).toEqual(quantity(0.2, 'rad', source.id))
    expect(store.getSnapshot().state.controls.elevator.status).toBe('unconfigured')
  })

  it('sets all CG components in one notification and captures old/new values', () => {
    const store = createAircraftStore([scenario()], 'test', { now })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const result = store.dispatch({
      id: 'cg', type: 'SET_CG', source: 'numeric-input', context: { scenarioId: 'test', model: null },
      payload: { position: { frame: 'engineering', unit: 'm', x: -2, y: 3, z: 4 }, provenanceId: source.id },
    })
    expect(result.ok).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().state.massProperties.cgX).toEqual(quantity(-2, 'm', source.id))
    expect(store.getSnapshot().state.massProperties.cgY).toEqual(quantity(3, 'm', source.id))
    expect(store.getSnapshot().state.massProperties.cgZ).toEqual(quantity(4, 'm', source.id))
    expect(store.getSnapshot().events[0]?.changes).toContainEqual({ path: 'massProperties.cgX', before: quantity(1, 'm', source.id), after: quantity(-2, 'm', source.id) })
    unsubscribe()
    store.dispatch(reset())
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it.each([
    null, {}, { ...scalar(), type: 'UNKNOWN' },
    { ...scalar(), id: '' }, { ...scalar(), source: 'unknown' },
    { ...scalar(), context: {} }, { ...scalar(), context: { scenarioId: 'old', model: null } },
    { ...scalar(), payload: { value: { status: 'known', value: NaN, unit: 'm/s', provenanceId: 'synthetic' } } },
    { ...scalar(), payload: { value: { status: 'known', value: Infinity, unit: 'm/s', provenanceId: 'synthetic' } } },
    { ...scalar(), payload: { value: quantity(1, 'rad', 'synthetic') } },
    { ...scalar(), payload: { value: { status: 'known', value: '', unit: 'm/s', provenanceId: 'synthetic' } } },
    { ...scalar(), payload: { value: quantity(1, 'm/s', 'missing') } },
    scalar('SET_AIRSPEED', -1), scalar('SET_DENSITY', 0), scalar('SET_DENSITY', -1),
    scalar('SET_THROTTLE', -0.1), scalar('SET_THROTTLE', 1.1), reset('missing'),
    ...['RUN_SIMULATION', 'PAUSE_SIMULATION', 'STEP_SIMULATION'].map((type) => ({ ...scalar(), type, payload: null })),
  ])('rejects invalid/unavailable command %# without mutation or notification', (command) => {
    const store = createAircraftStore([scenario()], 'test', { now })
    const before = store.getSnapshot()
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.dispatch(command).ok).toBe(false)
    expect(store.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('rejects partially invalid CG atomically', () => {
    const store = createAircraftStore([scenario()], 'test', { now })
    const before = store.getSnapshot()
    expect(store.dispatch({ ...scalar(), type: 'SET_CG', payload: { position: { frame: 'engineering', unit: 'm', x: 3, y: 4, z: NaN }, provenanceId: source.id } }).ok).toBe(false)
    expect(store.getSnapshot()).toBe(before)
  })

  it('resolves new provenance atomically and refuses conflicting overwrite', () => {
    const store = createAircraftStore([scenario()], 'test', { now })
    const record = { ...source, id: 'new-source' }
    expect(store.dispatch({ ...scalar(), payload: { value: quantity(20, 'm/s', record.id) } }, record).ok).toBe(true)
    expect(store.getSnapshot().state.provenance[record.id]).toEqual(record)
    const before = store.getSnapshot()
    expect(store.dispatch(scalar('SET_ALPHA', 0.1, 'next'), { ...source, description: 'Overwritten' }).ok).toBe(false)
    expect(store.getSnapshot()).toBe(before)
  })

  it('rejects duplicate commands, including after reset, and enforces allowed commands', () => {
    const store = createAircraftStore([scenario()], 'test', { now, allowedCommandIds: ['SET_AIRSPEED', 'RESET_SCENARIO'] })
    expect(store.dispatch(scalar()).ok).toBe(true)
    expect(store.dispatch(scalar()).ok).toBe(false)
    expect(store.dispatch(scalar('SET_ALPHA', 0.1, 'alpha')).ok).toBe(false)
    expect(store.dispatch(reset()).ok).toBe(true)
    expect(store.dispatch(scalar()).ok).toBe(false)
    expect(store.getSnapshot().events).toHaveLength(2)
  })

  it('restores the entire baseline, modules and model selection while retaining history', () => {
    const first = scenario()
    const second = { ...scenario('second'), activeModels: [{ moduleId: 'synthetic-module', modelId: 'model', version: '1' }] }
    const store = createAircraftStore([first, second], 'test', { now })
    store.dispatch(scalar())
    store.dispatch(reset('second'))
    expect(store.getSnapshot().state).toEqual(second.baseline)
    expect(store.getSnapshot().activeModels).toEqual(second.activeModels)
    expect(store.dispatch({ ...scalar('SET_ALPHA', 0.2, 'stale'), context: { scenarioId: 'second', model: null } }).ok).toBe(false)
    const restore = { ...reset('test', 'restore'), context: { scenarioId: 'second', model: second.activeModels[0] } }
    expect(store.dispatch(restore).ok).toBe(true)
    expect(store.getSnapshot().state).toEqual(first.baseline)
    expect(store.getSnapshot().activeModuleIds).toEqual(first.activeModuleIds)
    expect(store.getSnapshot().activeModels).toEqual([])
    expect(store.getSnapshot().events).toHaveLength(3)
  })

  it('isolates baseline inputs and freezes snapshots/events recursively', () => {
    const definition = scenario()
    const store = createAircraftStore([definition], 'test', { now })
    Object.assign(definition.baseline, { aircraftId: 'changed' })
    expect(store.getSnapshot().state.aircraftId).toBe('synthetic-aircraft')
    store.dispatch(scalar())
    expect(() => Object.assign(store.getSnapshot().state.motion.airspeed, { value: 200 })).toThrow()
    expect(() => Object.assign(store.getSnapshot().events[0]!, { sequence: 99 })).toThrow()
  })

  it('validates baseline provenance and duplicate scenario definitions', () => {
    expect(() => createAircraftStore([scenario(), scenario()], 'test')).toThrow('Duplicate scenario')
    const bad = scenario()
    expect(() => createAircraftStore([{ ...bad, baseline: { ...bad.baseline, provenance: {} } }], 'test')).toThrow('provenance')
    expect(() => createAircraftStore([{ ...bad, baseline: { ...bad.baseline, environment: { ...bad.baseline.environment, density: quantity(-1, 'kg/m^3', source.id) } } }], 'test')).toThrow('greater than zero')
    expect(() => createAircraftStore([{ ...bad, baseline: { ...bad.baseline, simulation: { ...bad.baseline.simulation, timeStep: quantity(0, 's', source.id) } } }], 'test')).toThrow('positive')
  })

  it('does not mutate state when the event timestamp is invalid', () => {
    const store = createAircraftStore([scenario()], 'test', { now: () => 'not-a-date' })
    const before = store.getSnapshot()
    expect(store.dispatch(scalar()).ok).toBe(false)
    expect(store.getSnapshot()).toBe(before)
  })

  it('clears stale evidence on edits and restores it on reset', () => {
    const baseline = scenario()
    const withEvidence: ScenarioDefinition = { ...baseline, baseline: {
      ...baseline.baseline, evidence: [{
        id: 'synthetic-evidence', question: 'Test reset mechanics',
        model: { moduleId: 'synthetic-module', modelId: 'synthetic', version: '1' },
        fidelity: 0, assumptions: [], inputs: [], intermediates: [], outputs: [],
        validity: { status: 'not-assessed', applicableRange: [], limitations: [] },
        warnings: [], uncertainty: { status: 'not-assessed' }, schemaValidation: 'not-run',
        verification: 'not-run', provenanceIds: [], supportedClaims: [], unsupportedClaims: [], nextEvidence: [],
      }],
    } }
    const store = createAircraftStore([withEvidence], 'test', { now })
    store.dispatch(scalar())
    expect(store.getSnapshot().state.evidence).toEqual([])
    store.dispatch(reset())
    expect(store.getSnapshot().state).toEqual(withEvidence.baseline)
  })

  it('replays edits and resets to an identical state and history', () => {
    const definitions = [scenario()]
    const store = createAircraftStore(definitions, 'test', { now })
    store.dispatch(scalar())
    store.dispatch(scalar('SET_ALPHA', 0.1, 'angle'))
    store.dispatch(reset())
    store.dispatch(scalar('SET_THROTTLE', 0, 'throttle'))
    const replayed = replayEvents(definitions, 'test', store.getSnapshot().events)
    expect(replayed.getSnapshot()).toEqual(store.getSnapshot())
    const altered = store.getSnapshot().events.map((event) => ({ ...event, changes: [] }))
    expect(() => replayEvents(definitions, 'test', altered)).toThrow('diverged')
  })
})
