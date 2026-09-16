import { describe, expect, it } from 'vitest'
import { createModuleRuntime, createAircraftStore, replayEvents, quantity } from '../../src/platform'
import type { ModulePackage } from '../../src/platform'
import { signalCheckPackage } from '../../src/modules/signal-check/package'
import { parameterScenario } from '../../src/app/parameter-workspace'
import { matchesVersion } from '../../src/platform/module-system/versions'
function pkg(id: string, dependencies: string[] = []): ModulePackage {
  return { descriptor: { ...signalCheckPackage.descriptor, id, requires: { platform: '^0.1.0', modules: dependencies.map((id) => ({ id, versionRange: '^0.1.0' })) }, inputs: [], outputs: [], stateExtensions: [], visualizationIds: [], verificationCaseIds: [] }, evaluate: () => ({ outputs: {}, extensions: {} }), visualizations: [], verification: [] }
}
const context = { scenarioId: parameterScenario.id, model: null }
function activate(ids: string[], id = 'activate') { return { id, type: 'SET_ACTIVE_MODULES', payload: { moduleIds: ids }, source: 'pointer', context } }
const speed = { id: 'speed', type: 'SET_AIRSPEED', source: 'numeric-input', context, payload: { value: quantity(25, 'm/s', 'input') } }
const provenance = { id: 'input', source: 'instructor-supplied' as const, description: 'Test input', derivedFrom: [] }

describe('module runtime', () => {
  it('resolves dependencies before consumers with stable lexical ordering regardless of installation order', () => {
    const runtime = createModuleRuntime()
    for (const p of [pkg('z', ['a']), pkg('b'), pkg('a')]) runtime.install(p)
    expect(runtime.resolve(['z', 'b'])).toEqual(['b', 'a', 'z'])
    expect(runtime.resolve(['b', 'z'])).toEqual(['b', 'a', 'z'])
  })
  it('rejects missing requirements, cycles, duplicate roots and incompatible versions', () => {
    const runtime = createModuleRuntime()
    runtime.install(pkg('a', ['b']))
    expect(() => runtime.resolve(['a'])).toThrow('Missing module')
    runtime.install(pkg('b', ['a']))
    expect(() => runtime.resolve(['a'])).toThrow('cycle')
    expect(() => runtime.resolve(['a','a'])).toThrow('Duplicate')
    const other = createModuleRuntime()
    other.install({ ...pkg('a'), descriptor: { ...pkg('a').descriptor, requires: { platform: '^2.0.0', modules: [] } } })
    expect(() => other.resolve(['a'])).toThrow('Incompatible platform')
    other.install({ ...pkg('b', ['a']), descriptor: { ...pkg('b', ['a']).descriptor, requires: { platform: '*', modules: [{ id: 'c', versionRange: '^2.0.0' }] } } })
    other.install(pkg('c'))
    expect(() => other.resolve(['b'])).toThrow('Incompatible dependency')
  })
  it('installs atomically and validates visualization and verification ownership', () => {
    const runtime = createModuleRuntime()
    runtime.install(signalCheckPackage)
    expect(() => runtime.install(signalCheckPackage)).toThrow('already registered')
    expect(() => runtime.install({ ...pkg('bad'), visualizations: signalCheckPackage.visualizations })).toThrow('Registration IDs')
    expect(runtime.list()).toHaveLength(1)
    expect(runtime.verify('signal-check').every((result) => result.passed)).toBe(true)
    expect(runtime.visualizations([])).toEqual([])
    expect(runtime.visualizations(['signal-check'])).toHaveLength(1)
  })
  it('enables, recomputes, logs derived changes, disables, resets and replays deterministically', () => {
    const runtime = createModuleRuntime(); runtime.install(signalCheckPackage)
    const store = createAircraftStore([parameterScenario], parameterScenario.id, { runtime })
    expect(store.dispatch(activate(['signal-check'])).ok).toBe(true)
    expect(store.getSnapshot().state.outputs['signal-check']?.airspeed?.status).toBe('unconfigured')
    expect(store.dispatch(speed, provenance).ok).toBe(true)
    expect(store.getSnapshot().state.outputs['signal-check']?.airspeed).toEqual(speed.payload.value)
    expect(store.getSnapshot().events.at(-1)?.changes.map((c) => c.path)).toContain('outputs.signal-check.airspeed')
    expect(store.dispatch(activate([], 'disable')).ok).toBe(true)
    expect(store.getSnapshot().state.outputs).toEqual({})
    expect(store.getSnapshot().state.modules).toEqual({})
    store.dispatch(activate(['signal-check'], 'reenable'))
    expect(store.getSnapshot().state.outputs['signal-check']?.airspeed).toEqual(speed.payload.value)
    store.dispatch({ id: 'reset', type: 'RESET_SCENARIO', source: 'system', context, payload: { scenarioId: parameterScenario.id } })
    expect(store.getSnapshot().activeModuleIds).toEqual([])
    expect(replayEvents([parameterScenario], parameterScenario.id, store.getSnapshot().events, { runtime }).getSnapshot()).toEqual(store.getSnapshot())
  })
  it('rejects evaluator exceptions and foreign outputs without committing anything', () => {
    for (const evaluate of [() => { throw new Error('model failed') }, () => ({ outputs: { 'outputs.other.bad': quantity(1, 'm', 'input') }, extensions: {} })]) {
      const runtime = createModuleRuntime(); runtime.install({ ...pkg('bad'), evaluate })
      const store = createAircraftStore([parameterScenario], parameterScenario.id, { runtime })
      const before = store.getSnapshot()
      expect(store.dispatch(activate(['bad'])).ok).toBe(false)
      expect(store.getSnapshot()).toBe(before)
    }
  })
  it('rejects wrong units, missing outputs, nonfinite values and missing provenance', () => {
    for (const output of [undefined, quantity(1, 'm', 'input'), { status: 'known', value: NaN, unit: 'm/s', provenanceId: 'input' }, quantity(1, 'm/s', 'missing')]) {
      const runtime = createModuleRuntime()
      runtime.install({ ...signalCheckPackage, evaluate: () => ({ outputs: { 'outputs.signal-check.airspeed': output }, extensions: { 'modules.signal-check.lastAirspeed': output } }) as ReturnType<ModulePackage['evaluate']> })
      const store = createAircraftStore([parameterScenario], parameterScenario.id, { runtime }); store.dispatch(speed, provenance)
      const before = store.getSnapshot()
      expect(store.dispatch(activate(['signal-check'])).ok).toBe(false)
      expect(store.getSnapshot()).toBe(before)
    }
  })
  it('rejects writes to frozen canonical state', () => {
    const runtime = createModuleRuntime()
    runtime.install({ ...pkg('bad'), evaluate: (state) => { Object.assign(state.motion, { airspeed: quantity(3, 'm/s', 'input') }); return { outputs: {}, extensions: {} } } })
    const store = createAircraftStore([parameterScenario], parameterScenario.id, { runtime })
    expect(store.dispatch(activate(['bad'])).ok).toBe(false)
    expect(store.getSnapshot().state.motion.airspeed.status).toBe('unconfigured')
  })
  it('makes downstream outputs available only through declared dependencies', () => {
    const runtime = createModuleRuntime(); runtime.install(signalCheckPackage)
    const consumer = pkg('consumer', ['signal-check'])
    runtime.install({ ...consumer, descriptor: { ...consumer.descriptor, inputs: [{ id: 'source', source: { kind: 'output', outputId: 'outputs.signal-check.airspeed' } }] }, evaluate: (state) => { expect(state.outputs['signal-check']?.airspeed).toBeDefined(); return { outputs: {}, extensions: {} } } })
    expect(runtime.evaluate(parameterScenario.baseline, ['consumer']).activeModuleIds).toEqual(['signal-check', 'consumer'])
  })
})
describe('version constraints', () => {
  it.each([['0.1.9','^0.1.0',true],['0.2.0','^0.1.0',false],['1.9.0','^1.2.3',true],['2.0.0','^1.2.3',false],['1.2.9','~1.2.3',true],['1.3.0','~1.2.3',false],['0.0.2','^0.0.1',false],['1.2.3','1.2.3',true],['1.2.4','1.2.3',false]])('%s matches %s: %s', (version, range, expected) => expect(matchesVersion(version, range)).toBe(expected))
  it('rejects unsupported ranges rather than guessing', () => expect(() => matchesVersion('1.0.0', '>=1')).toThrow('Unsupported'))
})

it('accepts owned computed provenance with declared sources', () => {
  const runtime = createModuleRuntime()
  runtime.install({ ...signalCheckPackage, evaluate: (state) => {
    if (state.motion.airspeed.status !== 'known') return signalCheckPackage.evaluate(state)
    const value = quantity(state.motion.airspeed.value, 'm/s', 'signal-check:result')
    return { outputs: { 'outputs.signal-check.airspeed': value }, extensions: { 'modules.signal-check.lastAirspeed': value }, provenance: [{ id: 'signal-check:result', source: 'computed', description: 'Copied signal', derivedFrom: [state.motion.airspeed.provenanceId] }] }
  } })
  const store = createAircraftStore([parameterScenario], parameterScenario.id, { runtime })
  store.dispatch(speed, provenance)
  expect(store.dispatch(activate(['signal-check'])).ok).toBe(true)
  expect(store.getSnapshot().state.provenance['signal-check:result']?.derivedFrom).toEqual(['input'])
})
it('rejects a failing recomputation without losing the prior active state or accepting the edit', () => {
  const runtime = createModuleRuntime()
  runtime.install({ ...signalCheckPackage, evaluate: (state) => {
    if (state.motion.airspeed.status === 'known') throw new Error('Rejected model input')
    return signalCheckPackage.evaluate(state)
  } })
  const store = createAircraftStore([parameterScenario], parameterScenario.id, { runtime })
  store.dispatch(activate(['signal-check']))
  const before = store.getSnapshot()
  expect(store.dispatch(speed, provenance).ok).toBe(false)
  expect(store.getSnapshot()).toBe(before)
})
it('removes implicit dependencies when their last activation root is disabled', () => {
  const runtime = createModuleRuntime(); runtime.install(pkg('a')); runtime.install(pkg('b', ['a']))
  const store = createAircraftStore([parameterScenario], parameterScenario.id, { runtime })
  store.dispatch(activate(['b']))
  expect(store.getSnapshot().moduleRoots).toEqual(['b'])
  expect(store.getSnapshot().activeModuleIds).toEqual(['a','b'])
  store.dispatch(activate([], 'disable'))
  expect(store.getSnapshot().activeModuleIds).toEqual([])
})
