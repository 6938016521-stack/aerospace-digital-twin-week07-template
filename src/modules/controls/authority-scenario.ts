import { elevatorScenario } from './elevator-scenario'
import { quantity, type ScenarioDefinition } from '../../platform'
const base = elevatorScenario.baseline
const id = 'c4-illustrative-source'
const q = <U extends Parameters<typeof quantity>[1]>(v: number, unit: U) => quantity(v, unit, id)
const angle = (v: number) => q(v * Math.PI / 180, 'rad')
export const authorityScenario: ScenarioDefinition = {
  ...elevatorScenario, id: 'c4-authority-example', title: 'C4 illustrative authority envelope',
  baseline: { ...base,
    modules: { controls: { ...base.modules.controls, aeroMode: q(2, '1'), kneeAngle: angle(8), reducedSlope: q(0.35, '1'), geometricLimit: angle(15), actuatorLimit: angle(12), validityLimit: angle(20), forceLimit: q(1500, 'N'), gainUncertainty: q(0.2, '1'), rateLimit: q(20 * Math.PI / 180, 'rad/s'), responseTime: q(0.25, 's'), startAngle: angle(0) } },
    simulation: { ...base.simulation, scenarioId: 'c4-authority-example' },
    provenance: { ...base.provenance, [id]: { id, source: 'ai-assisted', description: 'Software-authored illustrative C4 settings, not instructor-approved aircraft data. Symmetric travel; piecewise slope; bounded ±20% gain; equivalent-force structural proxy. Rate is a planning constraint from explicit start pose, not simulated actuator dynamics.', derivedFrom: [] } },
  },
}
