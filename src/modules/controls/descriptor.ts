import { authorityFields, authorityOutputs } from './authority-model'
import { aeroFields, aeroOutputs } from './elevator-model'
import { pitchFields, pitchOutputs } from './pitch-model'
import type { EngineeringModuleDescriptor } from '../../platform/module-system/types'
export const controlNames = ['elevator', 'aileron', 'rudder', 'flap'] as const
export const controlsDescriptor: EngineeringModuleDescriptor = {
  id: 'controls', version: '0.6.0', title: 'Control Authority',
  description: 'Control-surface previews and C2 prescribed-force pitch experiments. C3 adds linear effectiveness; C4 adds a piecewise model and declared authority envelopes.',
  implementation: 'provided', requires: { platform: '^0.1.0', modules: [] },
  stateExtensions: Object.entries({ ...pitchFields, ...aeroFields, ...authorityFields }).map(([name, field]) => ({ path: `modules.controls.${name}`, label: field.label, unit: field.unit, editable: true })),
  inputs: [{ id: 'density', source: { kind: 'canonical', quantityId: 'environment.density' } }, { id: 'airspeed', source: { kind: 'canonical', quantityId: 'motion.airspeed' } }, ...controlNames.map((name) => ({ id: name, source: { kind: 'canonical' as const, quantityId: `controls.${name}Commanded` as const } })), { id: 'pitchInertia', source: { kind: 'canonical', quantityId: 'massProperties.pitchInertia' } }, { id: 'centerOfGravityX', source: { kind: 'canonical', quantityId: 'massProperties.cgX' } }],
  outputs: [...controlNames.map((name) => ({ id: `outputs.controls.${name}Preview`, label: `${name} command preview`, unit: 'rad' as const })), ...Object.entries({ ...pitchOutputs, ...aeroOutputs, ...authorityOutputs }).map(([name, field]) => ({ id: `outputs.controls.${name}`, ...field }))],
  pitchMomentOutputIds: ['outputs.controls.tailMoment', 'outputs.controls.competingMoment'],
  commands: controlNames.map((name) => ({ id: `SET_${name.toUpperCase()}`, description: `Set canonical ${name} command.` })),
  modelSlots: [], visualizationIds: controlNames.map((name) => `controls.${name}`), lessonIds: [],
  verificationCaseIds: ['controls.elevatorScaling', 'controls.missing', 'controls.commands', 'controls.pitchRegression'], evidenceRuleIds: [],
}
