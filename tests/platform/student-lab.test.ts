import { describe, expect, it } from 'vitest'
import { evaluateStudentArtifact, instructorWeek07ReferenceArtifact, verifyStudentArtifact, week07BaselineInputs } from '../../src/student/lab'
import { createStudentControlsPackage } from '../../src/modules/controls/student-package'
import { createUnconfiguredAircraftState, quantity } from '../../src/platform'
import { createWeek07Store } from '../../src/app/week07-store'

describe('Week 07 student artifact evaluator', () => {
  it('evaluates the supplied instructor reference baselines without eval', () => {
    const baseline = evaluateStudentArtifact(instructorWeek07ReferenceArtifact, week07BaselineInputs())
    const zero = evaluateStudentArtifact(instructorWeek07ReferenceArtifact, week07BaselineInputs({ requestedAcceleration: 0 }))
    const quarter = evaluateStudentArtifact(instructorWeek07ReferenceArtifact, week07BaselineInputs({ airspeed: 20 }))
    const neutral = evaluateStudentArtifact(instructorWeek07ReferenceArtifact, week07BaselineInputs({ elevatorAngle: 0 }))
    expect(baseline['controls.demand'].values.requiredMoment!.value).toBe(1350)
    expect(zero['controls.demand'].values.requiredMoment!.value).toBe(750)
    expect(baseline['controls.effectiveness'].values.deltaMoment!.value).toBeCloseTo(1642.0057602762654, 10)
    expect(quarter['controls.effectiveness'].values.deltaMoment!.value).toBeCloseTo(1642.0057602762654 / 4, 10)
    expect(neutral['controls.effectiveness'].values.deltaMoment!.value).toBe(0)
    expect(verifyStudentArtifact(instructorWeek07ReferenceArtifact).passed).toBe(true)
  })

  it('rejects malicious, dimensionally invalid, and cyclic equations safely', () => {
    const broken = structuredClone(instructorWeek07ReferenceArtifact) as unknown as { slots: { expressions: { name: string; expression: string; unit: '1' | 'Pa' | 'N*m' }[] }[] }
    broken.slots[0]!.expressions = [{ name: 'requiredMoment', expression: 'globalThis.process.exit()', unit: 'N*m' }]
    broken.slots[1]!.expressions = [
      { name: 'dynamicPressure', expression: 'deltaMoment', unit: 'Pa' },
      { name: 'deltaCm', expression: 'referenceArea + elevatorAngle', unit: '1' },
      { name: 'deltaMoment', expression: 'dynamicPressure', unit: 'N*m' },
    ]
    const result = evaluateStudentArtifact(broken as unknown as typeof instructorWeek07ReferenceArtifact, week07BaselineInputs())
    expect(result['controls.demand'].valid).toBe(false)
    expect(result['controls.effectiveness'].valid).toBe(false)
    expect(result['controls.demand'].errors.join(' ')).toMatch(/Unsupported character|Unexpected/)
    expect(result['controls.effectiveness'].errors.join(' ')).toMatch(/Dependency cycle|matching dimensions/)
  })

  it('keeps C4 unavailable instead of falling back to instructor calculations', () => {
    const base = createUnconfiguredAircraftState()
    const source = quantity(1, '1', 'fixture')
    const state = {
      ...base,
      massProperties: { ...base.massProperties, pitchInertia: quantity(5000, 'kg*m^2', 'fixture') },
      environment: { ...base.environment, density: quantity(1.225, 'kg/m^3', 'fixture') },
      motion: { ...base.motion, airspeed: quantity(40, 'm/s', 'fixture') },
      controls: { ...base.controls, elevatorCommanded: quantity(-Math.PI / 36, 'rad', 'fixture') },
      modules: { controls: { aeroMode: quantity(2, '1', 'fixture'), requestedAcceleration: quantity(.12, 'rad/s^2', 'fixture'), competingMoment: quantity(-750, 'N*m', 'fixture'), referenceArea: quantity(16, 'm^2', 'fixture'), referenceChord: quantity(1.5, 'm', 'fixture'), elevatorDerivative: quantity(-.8, '1/rad', 'fixture') } },
      provenance: { fixture: { id: 'fixture', source: 'student-entered' as const, description: 'fixture', derivedFrom: [] } },
    }
    const result = createStudentControlsPackage(instructorWeek07ReferenceArtifact).evaluate(state)
    expect(result.outputs['outputs.controls.requiredMoment']).toEqual(expect.objectContaining({ status: 'unconfigured' }))
    expect((result.outputs['outputs.controls.requiredMoment'] as { reason: string }).reason).toMatch(/C4 authority is not available/)
    expect(source.status).toBe('known')
  })

  it('feeds the student C2/C3 result into the canonical pitch-moment sum', () => {
    const store = createWeek07Store(instructorWeek07ReferenceArtifact)
    expect(store.getSnapshot().state.loads.pitchMoment).toEqual(expect.objectContaining({ status: 'known', value: expect.closeTo(892.0057602762654, 8) }))
    const id = 'half-speed'
    const changed = store.dispatch({ id, type: 'SET_AIRSPEED', payload: { value: quantity(20, 'm/s', id) }, source: 'lesson', context: { scenarioId: 'week07-student', model: store.getSnapshot().activeModels[0]! } }, { id, source: 'student-entered', description: 'Half-speed regression.', derivedFrom: [] })
    expect(changed.ok).toBe(true)
    expect(store.getSnapshot().state.loads.pitchMoment).toEqual(expect.objectContaining({ status: 'known', value: expect.closeTo(-339.4985599309337, 8) }))
  })
})
