import { authorityFields, authorityOutputs, authorityAssessment, effectiveAngle, validateLimits, type AuthorityLimits } from './authority-model'
import { contentId } from '../../platform/provenance/content-id'
import { aeroFields, aeroOutputs, elevatorEffect, transferElevatorMoment } from './elevator-model'
import { pitchBalance, pitchFields, pitchOutputs } from './pitch-model'
import type { EngineeringValue, CanonicalUnit } from '../../platform'
import type { ProvenanceRecord } from '../../platform/provenance/types'
import { createUnconfiguredAircraftState, quantity, unconfigured } from '../../platform'
import type { ModulePackage, AircraftState } from '../../platform'
import { controlsDescriptor, controlNames } from './descriptor'
function evaluate(state: AircraftState) {
  const fields = Object.fromEntries(Object.entries({ ...pitchFields, ...aeroFields, ...authorityFields }).map(([name, field]) => [name, state.modules.controls?.[name] ?? unconfigured(field.unit)]))
  const outputs: Record<string, EngineeringValue<CanonicalUnit>> = Object.fromEntries(controlNames.map((name) => [`outputs.controls.${name}Preview`, state.controls[`${name}Commanded`]]))
  for (const [name, field] of Object.entries(pitchOutputs)) outputs[`outputs.controls.${name}`] = unconfigured(field.unit, 'Supply all C2 inputs, CG and positive inertia.')
  for (const [name, field] of Object.entries(aeroOutputs)) outputs[`outputs.controls.${name}`] = unconfigured(field.unit, 'Load the C3 example and configure its inputs.')
  for (const [name, field] of Object.entries(authorityOutputs)) outputs[`outputs.controls.${name}`] = unconfigured(field.unit, 'Configure all C4 limits and engineering inputs.')
  const provenance: ProvenanceRecord[] = []
  let appliedForce = fields.tailForce!
  const mode = fields.aeroMode
  if (mode?.status === 'known' && ![0, 1, 2].includes(mode.value)) throw new Error('Elevator model mode must be 0, 1 or 2.')
  const c4 = mode?.status === 'known' && mode.value === 2
  const limitValues = Object.keys(authorityFields).map(k => fields[k]!)
  const limits = limitValues.every(v => v.status === 'known') ? Object.fromEntries(Object.keys(authorityFields).map(k => [k, (fields[k] as { value: number }).value])) as AuthorityLimits : null
  if (c4 && limits) validateLimits(limits)
  if (mode?.status === 'known' && (mode.value === 1 || c4)) {
    appliedForce = unconfigured('N', 'Configure all elevator inputs and a nonzero equivalent force arm.')
    const aeroInputs = [state.environment.density, state.motion.airspeed, fields.referenceArea!, fields.referenceChord!, fields.elevatorDerivative!, state.controls.elevatorCommanded, fields.referenceStation!, fields.tailStation!]
    if (aeroInputs.every((value) => value.status === 'known') && (!c4 || limits)) {
      const known = aeroInputs.filter((value) => value.status === 'known')
      const result = elevatorEffect(known[0]!.value, known[1]!.value, known[2]!.value, known[3]!.value, known[4]!.value, c4 && limits ? effectiveAngle(known[5]!.value, limits.kneeAngle, limits.reducedSlope) : known[5]!.value)
      const id = contentId('controls:elevator', c4 ? [known, limitValues] : known)
      provenance.push({ id, source: 'computed', description: (c4 ? 'C4 continuous piecewise effective angle with reduced slope beyond knee; ' : '') + 'Illustrative increment: deltaCm=Cm_delta_e*delta_e; deltaM=q*S*c*deltaCm about fixed reference X. Ideal actuator and equivalent force at declared tail station; no residual tail couple.', derivedFrom: [...new Set([...known, ...(c4 ? limitValues.filter(v => v.status === 'known') : [])].map((value) => value.provenanceId))] })
      outputs['outputs.controls.deltaCm'] = quantity(result.deltaCm, '1', id)
      outputs['outputs.controls.deltaMoment'] = quantity(result.deltaMoment, 'N*m', id)
      appliedForce = quantity(transferElevatorMoment(result.deltaMoment, known[6]!.value, known[7]!.value, known[6]!.value).force, 'N', id)
      outputs['outputs.controls.effectiveTailForce'] = appliedForce
      if (c4 && limits && state.massProperties.cgX.status === 'known' && state.massProperties.pitchInertia.status === 'known' && fields.requestedAcceleration?.status === 'known' && fields.competingMoment?.status === 'known') {
        const required = state.massProperties.pitchInertia.value * fields.requestedAcceleration.value - fields.competingMoment.value
        const coefficient = result.dynamicPressure * known[2]!.value * known[3]!.value * known[4]!.value / (known[6]!.value - known[7]!.value)
        const assessment = authorityAssessment(limits, coefficient, state.massProperties.cgX.value - known[7]!.value, required, known[5]!.value)
        const references = [id, state.massProperties.cgX.provenanceId, state.massProperties.pitchInertia.provenanceId, fields.requestedAcceleration.provenanceId, fields.competingMoment.provenanceId]
        const aid = contentId('controls:authority', references)
        provenance.push({ id: aid, source: 'computed', description: 'Illustrative symmetric limits and bounded gain uncertainty. Binding: ' + assessment.binding.join(', ') + '. Rate interval is planning from declared start, not integrated actuation. No aircraft validation.', derivedFrom: references })
        outputs['outputs.controls.requiredMoment'] = quantity(required, 'N*m', aid)
        const commandInModel = Math.abs(known[5]!.value) <= limits.validityLimit
        const estimates = {
          ...assessment,
          estimatedForce: commandInModel ? appliedForce.status === 'known' ? appliedForce.value : null : null,
          estimatedMoment: commandInModel ? assessment.moment(known[5]!.value) : null,
          estimatedNetMoment: commandInModel ? assessment.moment(known[5]!.value) + fields.competingMoment.value : null,
          estimatedAcceleration: commandInModel ? (assessment.moment(known[5]!.value) + fields.competingMoment.value) / state.massProperties.pitchInertia.value : null,
        }
        for (const [name, field] of Object.entries(authorityOutputs)) {
          const value = estimates[name as keyof typeof authorityOutputs]
          outputs[`outputs.controls.${name}`] = value === null ? unconfigured(field.unit, name.startsWith('estimated') ? 'Requested angle is outside the declared model range; no estimate asserted.' : name.includes('TargetAngle') || name === 'targetAngle' ? 'No finite inverse solution in the piecewise law.' : 'Planning start pose lies outside the static envelope.') : quantity(value, field.unit, aid)
        }
        if (!assessment.withinEnvelope) appliedForce = unconfigured('N', 'Command outside the declared C4 static envelope; pitch execution unavailable.')
      } else if (c4) appliedForce = unconfigured('N', 'Configure all C4 inputs before pitch execution.')
      if (c4 && appliedForce.status === 'unconfigured') {
        outputs['outputs.controls.effectiveTailForce'] = appliedForce
        outputs['outputs.controls.deltaCm'] = unconfigured('1', appliedForce.reason)
        outputs['outputs.controls.deltaMoment'] = unconfigured('N*m', appliedForce.reason)
      }

    }
  }
  const inputs = [state.massProperties.pitchInertia, fields.requestedAcceleration!, fields.competingMoment!, state.massProperties.cgX, fields.tailStation!, appliedForce]
  if (inputs.every((value) => value.status === 'known')) {
    const known = inputs.filter((value) => value.status === 'known')
    const result = pitchBalance(known[0]!.value, known[1]!.value, known[2]!.value, known[3]!.value, known[4]!.value, known[5]!.value)
    const id = contentId('controls:pitch', known)
    provenance.push({ id, source: 'computed', description: 'Prescribed body-Z force: My=(cgX-tailX)Fz; required My=Iy*target-competing. Planar, no aerodynamic feedback.', derivedFrom: [...new Set(known.map((value) => value.provenanceId))] })
    const values = { signedArm: result.arm, perpendicularArm: Math.abs(result.arm), tailMoment: result.controlMoment, competingMoment: known[2]!.value, requiredMoment: result.requiredMoment, achievedAcceleration: result.acceleration, requiredForce: result.requiredForce }
    for (const [name, field] of Object.entries(pitchOutputs)) {
      const value = values[name as keyof typeof values]
      outputs[`outputs.controls.${name}`] = value === null ? unconfigured(field.unit, 'Zero moment arm: no finite force can supply a nonzero moment.') : quantity(value, field.unit, id)
    }
  }
  return { outputs, extensions: Object.fromEntries(Object.entries(fields).map(([name, value]) => [`modules.controls.${name}`, value])), provenance }
}
export const controlsPackage: ModulePackage = {
  descriptor: controlsDescriptor, evaluate,
  visualizations: controlNames.map((name) => ({ id: `controls.${name}`, kind: 'quantity-readout', outputId: `outputs.controls.${name}Preview`, title: `${name} command preview` })),
  verification: [
    { id: 'controls.elevatorScaling', description: 'Linear elevator moment and quadratic speed scaling.', run: () => { const a = elevatorEffect(1.225, 40, 16, 1.5, -0.8, -Math.PI / 36); const b = elevatorEffect(1.225, 80, 16, 1.5, -0.8, -Math.PI / 36); return { passed: Math.abs(a.deltaMoment - 1642.0057602762654) < 1e-8 && b.deltaMoment === 4 * a.deltaMoment, detail: 'Illustrative regression and speed scaling pass; this does not establish aircraft validity.' } } },
    { id: 'controls.pitchRegression', description: 'Supplied C2 regression', run: () => ({ passed: pitchBalance(5000, 0.12, -750, 0, -3, 450).requiredMoment === 1350, detail: '5000 × 0.12 − (−750) = +1350 N·m.' }) },
    { id: 'controls.missing', description: 'Missing commands remain missing.', run: () => ({ passed: Object.values(evaluate(createUnconfiguredAircraftState()).outputs).every((value) => value.status === 'unconfigured'), detail: 'All four missing commands remain unconfigured.' }) },
    { id: 'controls.commands', description: 'Commands preserve their radians and provenance.', run: () => {
      const state = createUnconfiguredAircraftState()
      const value = quantity(Math.PI / 12, 'rad', 'fixture')
      const result = evaluate({ ...state, controls: { ...state.controls, elevatorCommanded: value, aileronCommanded: value, rudderCommanded: value, flapCommanded: value } })
      return { passed: controlNames.every((name) => result.outputs[`outputs.controls.${name}Preview`] === value), detail: 'All four commands preserve radians and provenance; no physical response is inferred.' }
    } },
  ],
}
