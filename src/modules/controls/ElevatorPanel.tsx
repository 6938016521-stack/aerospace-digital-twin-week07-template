import type { AircraftStore, StoreSnapshot, CanonicalUnit, EngineeringValue } from '../../platform'
import { quantity, radiansToDegrees } from '../../platform'
import { aeroFields } from './elevator-model'
import { QuantityInput } from './QuantityInput'
const known = (v: EngineeringValue<CanonicalUnit> | undefined) => v?.status === 'known' ? v.value : undefined
export function ElevatorPanel({ store, snapshot, section = 'experiment' }: { store: AircraftStore; snapshot: StoreSnapshot; section?: 'experiment' | 'setup' | 'calculations' }) {
  const state = snapshot.state, fields = state.modules.controls
  function input(label: string, value: number | undefined, unit: CanonicalUnit, type: string, name = '', degrees = false) {
    return <QuantityInput key={label} label={label} value={value === undefined ? undefined : degrees ? radiansToDegrees(value) : value} unit={degrees ? 'deg' : unit} apply={(number) => {
      const id = crypto.randomUUID(), v = quantity(degrees ? number * Math.PI / 180 : number, unit, id)
      const result = store.dispatch({ id: crypto.randomUUID(), type, payload: type === 'SET_MODULE_STATE' ? { moduleId: 'controls', field: name, value: v } : { value: v }, source: 'numeric-input', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } }, { id, source: 'instructor-supplied', description: 'Explicit illustrative elevator input.', derivedFrom: [] })
      return result.ok ? null : result.error
    }} />
  }
  const out = (label: string, value: EngineeringValue<CanonicalUnit> | undefined) => <div><span>{label}</span><output>{value?.status === 'known' ? `${Number(value.value.toPrecision(6))} ${value.unit}` : 'Unconfigured'}</output></div>
  return <section aria-label="Elevator effectiveness" className="elevator-panel">
    {section === 'experiment' && <>{input('Elevator (deg)', known(state.controls.elevatorCommanded), 'rad', 'SET_ELEVATOR', '', true)}{input('Airspeed (m/s)', known(state.motion.airspeed), 'm/s', 'SET_AIRSPEED')}</>}
    {section === 'setup' && <>{input('Density (kg/m³)', known(state.environment.density), 'kg/m^3', 'SET_DENSITY')}{Object.entries(aeroFields).filter(([name]) => name !== 'aeroMode').map(([name, config]) => input(config.label, known(fields?.[name]), config.unit, 'SET_MODULE_STATE', name))}<p>Cmδe is referenced to fixed body X. An equivalent force acts at the tail station, with no residual couple. Moving CG changes the moment about CG, not this force.</p></>}
    {section === 'calculations' && <><p>q = ½ρV²<br />ΔCm = Cmδe × {snapshot.scenarioId === 'c4-authority-example' ? 'piecewise effective angle' : 'δe (radians)'}<br />ΔMref = q S c̄ ΔCm<br />Fz = ΔMref / (Xref − Xtail)<br />ΔMCG = (XCG − Xtail) Fz</p><div className="pitch-results">{out('Dynamic pressure q', state.loads.dynamicPressure)}{out('Elevator δe', state.controls.elevatorCommanded)}{out('ΔCm', state.outputs.controls?.deltaCm)}{out('ΔM at fixed reference', state.outputs.controls?.deltaMoment)}{out('Equivalent tail force', state.outputs.controls?.effectiveTailForce)}{out('Elevator moment about CG', state.outputs.controls?.tailMoment)}</div><p>Illustrative {snapshot.scenarioId === 'c4-authority-example' ? 'piecewise' : 'linear'} model and ideal actuator. No trim, downwash, stall or damping. Positive elevator is trailing-edge down.</p></>}
  </section>
}
