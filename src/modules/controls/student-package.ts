import { transferElevatorMoment } from './elevator-model'
import { contentId } from '../../platform/provenance/content-id'
import { quantity, unconfigured } from '../../platform/units/types'
import type { AircraftState, CanonicalUnit, EngineeringValue, ModulePackage } from '../../platform'
import { controlsDescriptor, controlNames } from './descriptor'
import { evaluateStudentArtifact, verifyStudentArtifact, type StudentLabArtifact, type Week07Inputs } from '../../student/lab'

/**
 * C2/C3-only adapter for a student-owned Week 07 artifact.  It intentionally
 * never delegates a bad student equation to the supplied C2/C3/C4 implementation.
 */
export function createStudentControlsPackage(artifact: StudentLabArtifact): ModulePackage {
  const descriptor = Object.freeze({
    ...controlsDescriptor,
    version: controlsDescriptor.version,
    verificationCaseIds: ['controls.studentWeek07'],
    description: 'Week 07 student C2/C3 equations. C4 authority remains an instructor-supplied, separate reference model.',
    modelSlots: Object.freeze([
      { id: 'controls.demand', title: 'Student C2 demand equation', studentReplaceable: true },
      { id: 'controls.effectiveness', title: 'Student C3 effectiveness equation', studentReplaceable: true },
    ]),
  })
  return Object.freeze({
    descriptor,
    evaluate(state: AircraftState) {
      const fields = state.modules.controls ?? {}
      const mode = fields.aeroMode
      const c4 = mode?.status === 'known' && mode.value === 2
      const read = <U extends CanonicalUnit>(value: EngineeringValue<U> | undefined) => value?.status === 'known' ? value : undefined
      const known = {
        pitchInertia: read(state.massProperties.pitchInertia), requestedAcceleration: read(fields.requestedAcceleration), competingMoment: read(fields.competingMoment),
        density: read(state.environment.density), airspeed: read(state.motion.airspeed), referenceArea: read(fields.referenceArea), referenceChord: read(fields.referenceChord), elevatorDerivative: read(fields.elevatorDerivative), elevatorAngle: read(state.controls.elevatorCommanded),
      }
      const inputs = Object.fromEntries(Object.entries(known).map(([name, value]) => [name, value ?? unconfigured((name === 'pitchInertia' ? 'kg*m^2' : name === 'requestedAcceleration' ? 'rad/s^2' : name === 'competingMoment' ? 'N*m' : name === 'density' ? 'kg/m^3' : name === 'airspeed' ? 'm/s' : name === 'referenceArea' ? 'm^2' : name === 'referenceChord' ? 'm' : name === 'elevatorDerivative' ? '1/rad' : 'rad') as CanonicalUnit)])) as Week07Inputs
      const evaluations = evaluateStudentArtifact(artifact, inputs)
      const sources = Object.values(known).filter((value): value is Extract<typeof value, { status: 'known' }> => value?.status === 'known').map((value) => value.provenanceId)
      const id = contentId('controls:student-week07', { artifact, inputs, geometry: [state.massProperties.cgX, fields.referenceStation, fields.tailStation] })
      const reason = c4 ? 'C4 authority is not available in the Week 07 student C2/C3 adapter; use the separate instructor reference model.' : [...evaluations['controls.demand'].errors, ...evaluations['controls.effectiveness'].errors].join(' ') || 'Supply all canonical inputs required by the student model.'
      const outputs: Record<string, EngineeringValue<CanonicalUnit>> = Object.fromEntries(descriptor.outputs.map((output) => [output.id, unconfigured(output.unit, reason)]))
      for (const name of controlNames) outputs[`outputs.controls.${name}Preview`] = state.controls[`${name}Commanded`]
      if (!c4 && evaluations['controls.demand'].valid) outputs['outputs.controls.requiredMoment'] = quantity(evaluations['controls.demand'].values.requiredMoment!.value, 'N*m', id)
      if (!c4 && evaluations['controls.effectiveness'].valid) {
        for (const [name, unit] of [['deltaCm', '1'], ['deltaMoment', 'N*m']] as const) outputs[`outputs.controls.${name}`] = quantity(evaluations['controls.effectiveness'].values[name]!.value, unit, id)
      }
      if (!c4 && evaluations['controls.demand'].valid && evaluations['controls.effectiveness'].valid) {
        const cg = read(state.massProperties.cgX), tail = read(fields.tailStation), reference = read(fields.referenceStation)
        if (cg && tail && reference && known.pitchInertia && known.pitchInertia.value > 0 && known.competingMoment && reference.value !== tail.value) {
          const moment = evaluations['controls.effectiveness'].values.deltaMoment!.value
          const transfer = transferElevatorMoment(moment, reference.value, tail.value, cg.value)
          const required = evaluations['controls.demand'].values.requiredMoment!.value
          const arm = cg.value - tail.value
          const mapped = { effectiveTailForce: [transfer.force, 'N'], tailMoment: [transfer.momentAtCG, 'N*m'], competingMoment: [known.competingMoment.value, 'N*m'], achievedAcceleration: [(transfer.momentAtCG + known.competingMoment.value) / known.pitchInertia.value, 'rad/s^2'], signedArm: [arm, 'm'], perpendicularArm: [Math.abs(arm), 'm'] } as const
          for (const [name, [value, unit]] of Object.entries(mapped)) outputs[`outputs.controls.${name}`] = quantity(value, unit, id)
          if (arm !== 0) outputs['outputs.controls.requiredForce'] = quantity(required / arm, 'N', id)
          sources.push(cg.provenanceId, tail.provenanceId, reference.provenanceId)
        }
      }
      const extensions = Object.fromEntries(descriptor.stateExtensions.map((field) => [field.path, fields[field.path.split('.')[2]!] ?? unconfigured(field.unit)]))
      return {
        outputs,
        extensions,
        provenance: sources.length && !c4 && (evaluations['controls.demand'].valid || evaluations['controls.effectiveness'].valid) ? [{ id, source: 'computed' as const, description: `Student Week 07 C2/C3 artifact ${artifact.id}@${artifact.version}; outputs are derived only from its validated expressions.`, derivedFrom: [...new Set(sources)] }] : [],
      }
    },
    visualizations: controlNames.map((name) => ({ id: `controls.${name}`, kind: 'quantity-readout' as const, outputId: `outputs.controls.${name}Preview`, title: `${name} command preview` })),
    verification: [{ id: 'controls.studentWeek07', description: 'Student artifact C2/C3 verification.', run: () => verifyStudentArtifact(artifact) }],
  })
}
