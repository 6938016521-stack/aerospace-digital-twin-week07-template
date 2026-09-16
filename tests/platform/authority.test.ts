import { expect, it } from 'vitest'
import { authorityAssessment, effectiveAngle, type AuthorityLimits } from '../../src/modules/controls/authority-model'
import { createParameterStore, parameterScenario } from '../../src/app/parameter-workspace'
import { authorityScenario } from '../../src/modules/controls/authority-scenario'
import { quantity, replayEvents } from '../../src/platform'
import { createBundledRuntime } from '../../src/app/bundled-modules'
const l: AuthorityLimits = { kneeAngle: 0.1, reducedSlope: 0.5, geometricLimit: 0.4, actuatorLimit: 0.3, validityLimit: 0.5, forceLimit: 100, gainUncertainty: 0.2, rateLimit: 0.2, responseTime: 1, startAngle: 0 }
it('is continuous and odd at both piecewise knees, including a zero post-knee slope', () => {
  expect(effectiveAngle(0.1, 0.1, 0.5)).toBe(0.1)
  expect(effectiveAngle(0.1 + 1e-10, 0.1, 0.5)).toBeCloseTo(0.1, 9)
  expect(effectiveAngle(-0.3, 0.1, 0.5)).toBeCloseTo(-0.2)
  expect(effectiveAngle(0.3, 0.1, 0)).toBe(0.1)
})
it('intersects travel and force limits including worst-case gain and reports signed target margin', () => {
  const a = authorityAssessment(l, 1000, 3, 150, 0)
  expect(a.usableAngle).toBeCloseTo(1 / 12)
  expect(a.binding).toEqual(['structure'])
  expect(a.availableMoment).toBeCloseTo(250)
  expect(a.guaranteedMoment).toBeCloseTo(200)
  expect(a.possibleMoment).toBeCloseTo(300)
  expect(a.authorityMargin).toBeCloseTo(50)
  expect(authorityAssessment(l, -1000, -3, -150, 0).authorityMargin).toBeCloseTo(50)
  expect(authorityAssessment({ ...l, forceLimit: 10000 }, 1000, 3, 0, 0).binding).toEqual(['actuator'])
  expect(authorityAssessment({ ...l, geometricLimit: 0.01 }, 1000, 3, 0, 0).binding).toEqual(['geometry'])
  expect(authorityAssessment({ ...l, validityLimit: 0.01 }, 1000, 3, 0, 0).binding).toEqual(['validity'])
})
it('handles zero authority, zero travel, saturation, boundary commands, and horizon reachability', () => {
  expect(authorityAssessment(l, 0, 3, 10, 0).authorityMargin).toBe(-10)
  expect(authorityAssessment(l, 1000, 0, 10, 0).authorityMargin).toBe(-10)
  expect(authorityAssessment({ ...l, actuatorLimit: 0 }, 1000, 3, 0, 0).usableAngle).toBe(0)
  const a = authorityAssessment(l, 1000, 3, 10, 0)
  expect(authorityAssessment(l, 1000, 3, 10, a.usableAngle).withinEnvelope).toBe(1)
  expect(authorityAssessment(l, 1000, 3, 10, a.usableAngle + 1e-8).withinEnvelope).toBe(0)
  expect(authorityAssessment({ ...l, responseTime: 0 }, 1000, 3, 10, 0).rateMargin).toBe(-10)
  expect(a.rateMargin).toBeGreaterThan(0)
  expect(authorityAssessment({ ...l, startAngle: 1 }, 1000, 3, 10, 0).rateMargin).toBeNull()
  expect(authorityAssessment({ ...l, reducedSlope: 0, forceLimit: 120 }, 1000, 3, 0, 0).binding).toEqual(['actuator'])
  expect(() => authorityAssessment({ ...l, gainUncertainty: 1 }, 1000, 3, 0, 0)).toThrow()
  expect(() => authorityAssessment({ ...l, responseTime: -1 }, 1000, 3, 0, 0)).toThrow()
})
it('commits C4 outputs, rejects invalid limits atomically, blocks excluded forces, resets and replays', () => {
  const store = createParameterStore()
  function send(id: string, type: string, payload: unknown, input = false) {
    return store.dispatch({ id, type, payload, source: 'numeric-input', context: { scenarioId: store.getSnapshot().scenarioId, model: null } }, input ? { id, source: 'instructor-supplied', description: 'Test', derivedFrom: [] } : undefined)
  }
  expect(send('load', 'RESET_SCENARIO', { scenarioId: authorityScenario.id }).ok).toBe(true)
  const before = store.getSnapshot()
  expect(before.state.outputs.controls?.authorityMargin?.status).toBe('known')
  expect(before.state.loads.pitchMoment.status).toBe('known')
  expect(send('bad', 'SET_MODULE_STATE', { moduleId: 'controls', field: 'rateLimit', value: quantity(-1, 'rad/s', 'bad') }, true).ok).toBe(false)
  expect(store.getSnapshot()).toBe(before)
  expect(send('outside', 'SET_ELEVATOR', { value: quantity(14 * Math.PI / 180, 'rad', 'outside') }, true).ok).toBe(true)
  expect(store.getSnapshot().state.loads.pitchMoment.status).toBe('unconfigured')
  expect(store.getSnapshot().state.outputs.controls?.requiredMoment).toMatchObject({ value: 1350 })
  expect(store.getSnapshot().state.outputs.controls?.effectiveTailForce?.status).toBe('unconfigured')
  expect(send('blocked', 'STEP_SIMULATION', null).ok).toBe(false)
  expect(send('reset', 'RESET_SCENARIO', { scenarioId: authorityScenario.id }).ok).toBe(true)
  expect(send('step', 'STEP_SIMULATION', null).ok).toBe(true)
  expect(replayEvents([parameterScenario, authorityScenario], parameterScenario.id, store.getSnapshot().events, { runtime: createBundledRuntime() }).getSnapshot()).toEqual(store.getSnapshot())
})
it('inverts the piecewise law on both sides and reports impossible saturated targets', () => {
  for (const coefficient of [-1000, 1000]) {
    const a = authorityAssessment({ ...l, forceLimit: 1e6 }, coefficient, 3, 600, 0)
    expect(a.targetAngle).not.toBeNull()
    expect(a.moment(a.targetAngle!)).toBeCloseTo(600)
    expect(a.moment(a.worstCaseTargetAngle!) * 0.8).toBeCloseTo(600)
  }
  expect(authorityAssessment({ ...l, reducedSlope: 0 }, 1000, 3, 600, 0).targetAngle).toBeNull()
  expect(authorityAssessment(l, 0, 3, 1, 0).targetAngle).toBeNull()
  expect(authorityAssessment(l, 1000, 0, 0, 0).targetAngle).toBe(0)
})
it('retains diagnostic estimates at a travel violation without allowing integration or extrapolation beyond validity', () => {
  const store = createParameterStore()
  const send = (id: string, type: string, payload: unknown) => store.dispatch({ id, type, payload, source: 'numeric-input', context: { scenarioId: store.getSnapshot().scenarioId, model: null } }, { id, source: 'instructor-supplied', description: 'Regression', derivedFrom: [] })
  send('load', 'RESET_SCENARIO', { scenarioId: authorityScenario.id })
  const outputs = store.getSnapshot().state.outputs.controls!
  expect(outputs.usableAngle?.status === 'known' && outputs.usableAngle.value).toBeGreaterThan(8 * Math.PI / 180)
  expect(outputs.targetAngle?.status === 'known' && outputs.targetAngle.value * 180 / Math.PI).toBeCloseTo(-4.110826)
  send('outside', 'SET_ELEVATOR', { value: quantity(14 * Math.PI / 180, 'rad', 'outside') })
  expect(store.getSnapshot().state.loads.pitchMoment.status).toBe('unconfigured')
  expect(store.getSnapshot().state.outputs.controls?.estimatedForce?.status).toBe('known')
  expect(store.getSnapshot().state.outputs.controls?.estimatedNetMoment?.status).toBe('known')
  expect(send('step', 'STEP_SIMULATION', null).ok).toBe(false)
  send('invalid-range', 'SET_ELEVATOR', { value: quantity(21 * Math.PI / 180, 'rad', 'invalid-range') })
  expect(store.getSnapshot().state.outputs.controls?.estimatedForce?.status).toBe('unconfigured')
})
