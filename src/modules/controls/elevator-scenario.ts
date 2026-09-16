import { pitchScenario } from './pitch-scenario'
import { quantity, unconfigured } from '../../platform'
import type { ScenarioDefinition } from '../../platform'
const base = pitchScenario.baseline
const id = 'c3-illustrative-source'
const q = <U extends Parameters<typeof quantity>[1]>(v: number, unit: U) => quantity(v, unit, id)
export const elevatorScenario: ScenarioDefinition = {
  ...pitchScenario, id: 'c3-elevator-example', title: 'C3 illustrative elevator model',
  baseline: { ...base,
    environment: { ...base.environment, density: q(1.225, 'kg/m^3') },
    motion: { ...base.motion, airspeed: q(40, 'm/s') },
    controls: { ...base.controls, elevatorCommanded: q(-5 * Math.PI / 180, 'rad') },
    modules: { controls: { ...base.modules.controls, tailForce: unconfigured('N', 'C3 computes equivalent force.'), aeroMode: q(1, '1'), referenceStation: q(0, 'm'), referenceArea: q(16, 'm^2'), referenceChord: q(1.5, 'm'), elevatorDerivative: q(-0.8, '1/rad') } },
    simulation: { ...base.simulation, scenarioId: 'c3-elevator-example' },
    provenance: { ...base.provenance, [id]: { id, source: 'instructor-supplied', description: 'Illustrative C3 defaults, not calibrated aircraft data: rho=1.225, V=40, S=16, chord=1.5, Cm_delta_e=-0.8/rad, elevator=-5 degrees. Moment derivative referenced to body X=0 with equivalent force at tail X=-3 m. Zero baseline aerodynamic moment, competing moment retained from C2.', derivedFrom: [] } },
  },
}
