import { createUnconfiguredAircraftState, quantity } from '../../platform'
import type { ModulePackage, AircraftState } from '../../platform'
function evaluate(state: AircraftState) {
  return { outputs: { 'outputs.signal-check.airspeed': state.motion.airspeed }, extensions: { 'modules.signal-check.lastAirspeed': state.motion.airspeed } }
}
export const signalCheckPackage: ModulePackage = {
  descriptor: {
    id: 'signal-check', version: '0.1.0', title: 'Airspeed signal check',
    description: 'Runtime demonstration: passes canonical airspeed through an owned output. No aerodynamic calculation.',
    implementation: 'provided', requires: { platform: '^0.1.0', modules: [] },
    inputs: [{ id: 'airspeed', source: { kind: 'canonical', quantityId: 'motion.airspeed' } }],
    outputs: [{ id: 'outputs.signal-check.airspeed', label: 'Airspeed signal', unit: 'm/s' }],
    stateExtensions: [{ path: 'modules.signal-check.lastAirspeed', label: 'Last airspeed signal', unit: 'm/s' }],
    commands: [], modelSlots: [], visualizationIds: ['signal-check.readout'], lessonIds: [],
    verificationCaseIds: ['signal-check.known', 'signal-check.missing'], evidenceRuleIds: [],
  }, evaluate,
  visualizations: [{ id: 'signal-check.readout', kind: 'quantity-readout', title: 'Airspeed signal', outputId: 'outputs.signal-check.airspeed' }],
  verification: [
    { id: 'signal-check.known', description: 'Passes through 25 m/s with its original provenance.', run: () => {
      const state = createUnconfiguredAircraftState()
      const input = quantity(25, 'm/s', 'fixture')
      const result = evaluate({ ...state, motion: { ...state.motion, airspeed: input } })
      return { passed: result.outputs['outputs.signal-check.airspeed'] === input, detail: '25 m/s passes through without unit or provenance changes.' }
    } },
    { id: 'signal-check.missing', description: 'Does not invent missing airspeed.', run: () => ({ passed: evaluate(createUnconfiguredAircraftState()).outputs['outputs.signal-check.airspeed'].status === 'unconfigured', detail: 'Missing input remains explicitly unconfigured.' }) },
  ],
}
