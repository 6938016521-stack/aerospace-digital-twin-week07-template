import { expect, it } from 'vitest'
import { elevatorEffect } from '../../src/modules/controls/elevator-model'
import { createParameterStore, parameterScenario } from '../../src/app/parameter-workspace'
import { elevatorScenario } from '../../src/modules/controls/elevator-scenario'
import { pitchScenario } from '../../src/modules/controls/pitch-scenario'
import { createBundledRuntime } from '../../src/app/bundled-modules'
import { quantity, replayEvents } from '../../src/platform'
it('converts degrees to radians and scales linearly with deflection and quadratically with speed', () => {
  const f = (v: number, a: number) => elevatorEffect(1.225, v, 16, 1.5, -0.8, a * Math.PI / 180)
  const base = f(40, -5)
  expect(base.dynamicPressure).toBeCloseTo(980)
  expect(base.deltaCm).toBeCloseTo(0.06981317008)
  expect(base.deltaMoment).toBeCloseTo(1642.005760276)
  expect(f(80, -5).deltaMoment).toBeCloseTo(base.deltaMoment * 4)
  expect(f(40, 5).deltaMoment).toBeCloseTo(-base.deltaMoment)
  expect(f(0, 5).deltaMoment).toBeCloseTo(0)
  expect(f(40, 0).deltaMoment).toBeCloseTo(0)
  expect(() => elevatorEffect(1, 2, 0, 1, 1, 1)).toThrow()
})
it('drives canonical moment and steps from elevator, preserves C2 and replays', () => {
  const store = createParameterStore()
  const context = () => ({ scenarioId: store.getSnapshot().scenarioId, model: null })
  const send = (id: string, type: string, payload: unknown) => store.dispatch({ id, type, payload, source: 'numeric-input', context: context() }, id === 'edit' || id === 'invalid' ? { id, source: 'instructor-supplied', description: 'Test input', derivedFrom: [] } : undefined)
  expect(send('load', 'RESET_SCENARIO', { scenarioId: elevatorScenario.id }).ok).toBe(true)
  const pressure = store.getSnapshot().state.loads.dynamicPressure
  expect(pressure.status === 'known' && pressure.value).toBeCloseTo(980)
  const original = store.getSnapshot()
  expect(send('invalid', 'SET_MODULE_STATE', { moduleId: 'controls', field: 'referenceArea', value: quantity(-1, 'm^2', 'invalid') }).ok).toBe(false)
  expect(store.getSnapshot()).toBe(original)
  expect(send('edit', 'SET_ELEVATOR', { value: quantity(0, 'rad', 'edit') }).ok).toBe(true)
  expect(store.getSnapshot().state.loads.pitchMoment).toMatchObject({ value: -750 })
  expect(send('step', 'STEP_SIMULATION', null).ok).toBe(true)
  expect(store.getSnapshot().state.motion.pitchRate).toMatchObject({ value: -0.003 })
  const replay = replayEvents([parameterScenario, pitchScenario, elevatorScenario], parameterScenario.id, store.getSnapshot().events, { runtime: createBundledRuntime() })
  expect(replay.getSnapshot()).toEqual(store.getSnapshot())
  expect(send('c2', 'RESET_SCENARIO', { scenarioId: pitchScenario.id }).ok).toBe(true)
  expect(store.getSnapshot().state.loads.pitchMoment).toMatchObject({ value: 600 })
})
it('retains force at zero CG arm while its moment vanishes', () => {
  const store = createParameterStore()
  store.dispatch({ id: 'load', type: 'RESET_SCENARIO', payload: { scenarioId: elevatorScenario.id }, source: 'pointer', context: { scenarioId: parameterScenario.id, model: null } })
  const result = store.dispatch({ id: 'cg', type: 'SET_CG', payload: { position: { x: -3, y: 0, z: 0, frame: 'engineering', unit: 'm' }, provenanceId: 'cg' }, source: 'numeric-input', context: { scenarioId: elevatorScenario.id, model: null } }, { id: 'cg', source: 'instructor-supplied', description: 'Zero arm', derivedFrom: [] })
  expect(result.ok).toBe(true)
  expect(store.getSnapshot().state.outputs.controls?.effectiveTailForce?.status).toBe('known')
  expect(store.getSnapshot().state.loads.pitchMoment).toMatchObject({ value: -750 })
})
it('CG translation preserves the C3 force and changes its moment just as in C2', () => {
  const store = createParameterStore()
  store.dispatch({ id: 'load', type: 'RESET_SCENARIO', payload: { scenarioId: elevatorScenario.id }, source: 'pointer', context: { scenarioId: parameterScenario.id, model: null } })
  const before = store.getSnapshot().state.outputs.controls!
  const result = store.dispatch({ id: 'cg', type: 'SET_CG', payload: { position: { x: 1, y: 0, z: 0, frame: 'engineering', unit: 'm' }, provenanceId: 'cg' }, source: 'numeric-input', context: { scenarioId: elevatorScenario.id, model: null } }, { id: 'cg', source: 'instructor-supplied', description: 'Forward CG', derivedFrom: [] })
  expect(result.ok).toBe(true)
  const after = store.getSnapshot().state.outputs.controls!
  expect(after.effectiveTailForce).toEqual(before.effectiveTailForce)
  expect(after.deltaMoment).toEqual(before.deltaMoment)
  expect(after.tailMoment?.status === 'known' && after.tailMoment.value).toBeCloseTo(1642.005760276 * 4 / 3)
  const snapshot = store.getSnapshot()
  expect(store.dispatch({ id: 'singular', type: 'SET_MODULE_STATE', payload: { moduleId: 'controls', field: 'referenceStation', value: quantity(-3, 'm', 'ref') }, source: 'numeric-input', context: { scenarioId: elevatorScenario.id, model: null } }, { id: 'ref', source: 'instructor-supplied', description: 'Invalid reference', derivedFrom: [] }).ok).toBe(false)
  expect(store.getSnapshot()).toBe(snapshot)
})
it('retains edited module settings through disable/re-enable and restores scenario defaults on reset', () => {
  const store = createParameterStore()
  const send = (id: string, type: string, payload: unknown, source?: { id: string; source: 'instructor-supplied'; description: string; derivedFrom: string[] }) => store.dispatch({ id, type, payload, source: 'pointer', context: { scenarioId: store.getSnapshot().scenarioId, model: null } }, source)
  send('load', 'RESET_SCENARIO', { scenarioId: elevatorScenario.id })
  send('area', 'SET_MODULE_STATE', { moduleId: 'controls', field: 'referenceArea', value: quantity(20, 'm^2', 'area') }, { id: 'area', source: 'instructor-supplied', description: 'Edited area', derivedFrom: [] })
  const before = store.getSnapshot()
  expect(send('off', 'SET_ACTIVE_MODULES', { moduleIds: [] }).ok).toBe(true)
  expect(store.getSnapshot().state.outputs.controls).toBeUndefined()
  expect(store.getSnapshot().state.modules.controls).toEqual(before.state.modules.controls)
  expect(send('on', 'SET_ACTIVE_MODULES', { moduleIds: ['controls'] }).ok).toBe(true)
  expect(store.getSnapshot().state.outputs.controls).toEqual(before.state.outputs.controls)
  expect(send('step', 'STEP_SIMULATION', null).ok).toBe(true)
  expect(replayEvents([parameterScenario, pitchScenario, elevatorScenario], parameterScenario.id, store.getSnapshot().events, { runtime: createBundledRuntime() }).getSnapshot()).toEqual(store.getSnapshot())
  send('reset', 'RESET_SCENARIO', { scenarioId: elevatorScenario.id })
  expect(store.getSnapshot().state.modules.controls?.referenceArea).toMatchObject({ value: 16 })
})
