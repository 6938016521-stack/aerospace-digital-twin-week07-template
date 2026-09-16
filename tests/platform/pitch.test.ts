import { stepPitch } from '../../src/platform/simulation/pitch'
import { describe, expect, it } from 'vitest'
import { createParameterStore, parameterScenario } from '../../src/app/parameter-workspace'
import { pitchScenario } from '../../src/modules/controls/pitch-scenario'
import { pitchBalance } from '../../src/modules/controls/pitch-model'
import { createBundledRuntime } from '../../src/app/bundled-modules'
import { quantity, replayEvents } from '../../src/platform'
function setup() {
  const store = createParameterStore()
  store.dispatch({ id: 'load', type: 'RESET_SCENARIO', payload: { scenarioId: pitchScenario.id }, source: 'pointer', context: { scenarioId: parameterScenario.id, model: null } })
  return store
}
const context = { scenarioId: pitchScenario.id, model: null }
const step = (id: string) => ({ id, type: 'STEP_SIMULATION', source: 'system', context, payload: null })
const source = { id: 'edit', source: 'instructor-supplied' as const, description: 'Test exploratory input', derivedFrom: [] }
describe('C2 prescribed-force model and kernel integration', () => {
  it('preserves the supplied regression and force/arm signs', () => {
    expect(pitchBalance(5000, 0.12, -750, 0, -3, 450)).toEqual({ arm: 3, controlMoment: 1350, requiredMoment: 1350, netMoment: 600, acceleration: 0.12, requiredForce: 450 })
    expect(pitchBalance(5000, 0, 0, 0, -3, -450).acceleration).toBe(-0.27)
    expect(pitchBalance(5000, 0, 0, -4, -3, 450).controlMoment).toBe(-450)
    expect(pitchBalance(5000, 0.12, -750, -3, -3, 450).requiredForce).toBeNull()
    expect(() => pitchBalance(0, 0, 0, 0, 0, 0)).toThrow()
  })
  it('target changes do not impose acceleration; CG changes alter the moment', () => {
    expect(pitchBalance(5000, 5, -750, 0, -3, 450).acceleration).toBe(0.12)
    expect(pitchBalance(5000, 0.12, -750, 1, -3, 450).netMoment).toBe(1050)
  })
  it('integrates the constant moment analytically and replays deterministically', () => {
    const store = setup()
    for (let i = 0; i < 50; i++) expect(store.dispatch(step(`step-${i}`)).ok).toBe(true)
    const state = store.getSnapshot().state
    expect(state.motion.pitch.status === 'known' && state.motion.pitch.value).toBeCloseTo(0.06, 10)
    expect(state.motion.pitchRate.status === 'known' && state.motion.pitchRate.value).toBeCloseTo(0.12, 10)
    expect(state.simulation.elapsedTime.status === 'known' && state.simulation.elapsedTime.value).toBeCloseTo(1, 10)
    expect(state.loads.pitchMoment.status === 'known' && state.loads.pitchMoment.value).toBe(600)
    expect(replayEvents([parameterScenario, pitchScenario], parameterScenario.id, store.getSnapshot().events, { runtime: createBundledRuntime() }).getSnapshot()).toEqual(store.getSnapshot())
  })
  it('rejects invalid inertia and foreign/noneditable module fields atomically', () => {
    const store = setup(), before = store.getSnapshot()
    for (const input of [
      { type: 'SET_PITCH_INERTIA', payload: { value: quantity(0, 'kg*m^2', 'edit') } },
      { type: 'SET_MODULE_STATE', payload: { moduleId: 'controls', field: 'tailForce', value: quantity(1, 'm', 'edit') } },
      { type: 'SET_MODULE_STATE', payload: { moduleId: 'controls', field: 'pitch', value: quantity(1, 'rad', 'edit') } },
    ]) expect(store.dispatch({ ...input, id: 'bad', source: 'pointer', context }, source).ok).toBe(false)
    expect(store.getSnapshot()).toBe(before)
  })
  it('pauses on parameter edits, clears contributions on disable, and resets the entire example', () => {
    const store = setup()
    store.dispatch({ ...step('run'), type: 'RUN_SIMULATION' })
    expect(store.getSnapshot().state.simulation.status).toBe('running')
    expect(store.dispatch({ id: 'change', type: 'SET_MODULE_STATE', payload: { moduleId: 'controls', field: 'tailForce', value: quantity(0, 'N', 'edit') }, source: 'pointer', context }, source).ok).toBe(true)
    expect(store.getSnapshot().state.simulation.status).toBe('paused')
    const moment = store.getSnapshot().state.loads.pitchMoment
    expect(moment.status === 'known' && moment.value).toBe(-750)
    store.dispatch({ id: 'disable', type: 'SET_ACTIVE_MODULES', payload: { moduleIds: [] }, source: 'pointer', context })
    expect(store.getSnapshot().state.loads.pitchMoment.status).toBe('unconfigured')
    expect(store.dispatch(step('missing-load')).ok).toBe(false)
    store.dispatch({ id: 'reset', type: 'RESET_SCENARIO', payload: { scenarioId: pitchScenario.id }, source: 'pointer', context })
    expect(store.getSnapshot().state.modules.controls?.tailForce).toEqual(pitchScenario.baseline.modules.controls?.tailForce)
  })
  it('stops at the display guard rather than silently clamping angles', () => {
    const store = setup(); store.dispatch({ ...step('play'), type: 'RUN_SIMULATION' })
    for (let i = 0; i < 200 && store.getSnapshot().state.simulation.status === 'running'; i++) store.dispatch(step(`s-${i}`))
    expect(store.getSnapshot().state.simulation.status).toBe('paused')
    const pitch = store.getSnapshot().state.motion.pitch
    expect(pitch.status === 'known' && pitch.value >= Math.PI / 6).toBe(true)
    expect(store.dispatch(step('guarded')).ok).toBe(false)
  })
})

it('shortens an extreme step to the guard with consistent time and rate', () => {
  const store = setup()
  store.dispatch({ id: 'inertia', type: 'SET_PITCH_INERTIA', payload: { value: quantity(0.001, 'kg*m^2', 'edit') }, source: 'numeric-input', context }, source)
  expect(store.dispatch(step('short')).ok).toBe(true)
  const state = store.getSnapshot().state
  const duration = Math.sqrt(2 * (Math.PI / 6) / 600000)
  expect(state.motion.pitch).toMatchObject({ value: Math.PI / 6 })
  const time = state.simulation.elapsedTime, rate = state.motion.pitchRate
  expect(time.status === 'known' && time.value).toBeCloseTo(duration, 12)
  expect(rate.status === 'known' && rate.value).toBeCloseTo(600000 * duration, 9)
  expect(state.simulation.status).toBe('paused')
})

it('detects a boundary crossing even when the step endpoint returns inside', () => {
  const base = pitchScenario.baseline
  const state = { ...base, massProperties: { ...base.massProperties, pitchInertia: quantity(1, 'kg*m^2', 'edit') }, motion: { ...base.motion, pitch: quantity(0.4, 'rad', 'edit'), pitchRate: quantity(40, 'rad/s', 'edit') }, loads: { ...base.loads, pitchMoment: quantity(-4000, 'N*m', 'edit') } }
  const next = stepPitch(state, 'turning-step')
  expect(next.motion.pitch).toMatchObject({ value: Math.PI / 6 })
  const time = next.simulation.elapsedTime, rate = next.motion.pitchRate
  expect(time.status === 'known' && time.value < 0.01).toBe(true)
  expect(rate.status === 'known' && rate.value > 0).toBe(true)
})
