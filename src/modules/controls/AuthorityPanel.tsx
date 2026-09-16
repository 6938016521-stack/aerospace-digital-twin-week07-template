import { useState } from 'react'
import { quantity, radiansToDegrees, type AircraftStore, type StoreSnapshot } from '../../platform'
import { authorityFields } from './authority-model'
import { QuantityInput } from './QuantityInput'
export function AuthorityPanel({ store, snapshot, setup = false, planning = false }: { store: AircraftStore; snapshot: StoreSnapshot; setup?: boolean; planning?: boolean }) {
  const [error, setError] = useState('')
  const f = snapshot.state.modules.controls, o = snapshot.state.outputs.controls
  const value = (name: string) => o?.[name]?.status === 'known' ? o[name].value : undefined
  const fieldValue = (name: string) => f?.[name]?.status === 'known' ? f[name].value : undefined
  const fmt = (v: number | undefined, digits = 2) => v === undefined ? 'Unavailable' : v.toFixed(digits)
  const deg = (v: number | undefined) => v === undefined ? 'Unavailable' : `${radiansToDegrees(v).toFixed(2)}°`
  const targetDegrees = (v: number | undefined) => v !== undefined && fieldValue('validityLimit') !== undefined && Math.abs(v) > fieldValue('validityLimit')! ? 'Outside model range' : deg(v)
  function input(name: keyof typeof authorityFields) {
    const field = authorityFields[name], v = fieldValue(name), angular = field.unit === 'rad' || field.unit === 'rad/s'
    return <QuantityInput key={name} label={field.label} unit={angular ? field.unit === 'rad' ? 'deg' : 'deg/s' : field.unit} value={v === undefined ? undefined : angular ? radiansToDegrees(v) : v} apply={n => {
      const id = crypto.randomUUID()
      const result = store.dispatch({ id, type: 'SET_MODULE_STATE', payload: { moduleId: 'controls', field: name, value: quantity(angular ? n * Math.PI / 180 : n, field.unit, id) }, source: 'numeric-input', context: { scenarioId: snapshot.scenarioId, model: null } }, { id, source: 'instructor-supplied', description: 'Exploratory C4 limit; not aircraft validation.', derivedFrom: [] })
      return result.ok ? null : result.error
    }} />
  }
  if (setup) return <section aria-label="Authority limits"><h4>Effectiveness curve</h4>{input('kneeAngle')}{input('reducedSlope')}<p>Beyond the knee, each extra degree supplies less additional moment.</p><h4>Travel and force limits</h4>{input('geometricLimit')}{input('actuatorLimit')}{input('forceLimit')}{input('validityLimit')}<p>The smallest permitted travel binds. Force is an equivalent-tail-force proxy, not a stress analysis.</p><details><summary>Effectiveness uncertainty</summary>{input('gainUncertainty')}<p>A bounded gain fraction, not a confidence level. The force limit always includes its upper bound.</p></details></section>
  if (planning) return <section aria-label="Separate rate planning"><h4>How quickly could the target be reached?</h4><p>This separate calculation starts from the pose below. It does not drive elevator motion; pitch playback assumes an instant, fixed deflection. Editing any parameter pauses playback.</p>{input('startAngle')}{input('rateLimit')}{input('responseTime')}<p>Within {fmt(fieldValue('responseTime'))} s, the permitted range from {deg(fieldValue('startAngle'))} is <strong>{deg(value('reachableMin'))} to {deg(value('reachableMax'))}</strong>.</p><p>Required nominal pose: {targetDegrees(value('targetAngle'))}. With the weakest effectiveness: {targetDegrees(value('worstCaseTargetAngle'))}.</p><p role="status">{value('rateMargin') === undefined ? 'Planning unavailable: the start is missing or outside usable travel.' : value('rateMargin')! < 0 ? `The target is outside the conservative reachable moment interval by ${fmt(-value('rateMargin')!)} N·m.` : `The target fits the conservative reachable moment interval, with ${fmt(value('rateMargin'))} N·m to its nearest boundary.`}</p><p>Uncertainty means different effectiveness values can require different final poses. This is capability, not guaranteed open-loop tracking.</p></section>
  const target = value('targetAngle'), usable = value('usableAngle'), margin = value('authorityMargin')
  const selected = snapshot.state.controls.elevatorCommanded
  const required = o?.requiredMoment?.status === 'known' ? o.requiredMoment.value : undefined
  const provenanceId = o?.usableAngle?.status === 'known' ? o.usableAngle.provenanceId : null
  const description = provenanceId ? snapshot.state.provenance[provenanceId]?.description : ''
  const binding = description?.match(/Binding: ([^.]+)/)?.[1] ?? 'unavailable'
  return <section aria-label="Authority assessment"><div className="pitch-results">
    <div><span>Required elevator · nominal</span><output>{targetDegrees(target)}</output></div>
    <div><span>Selected elevator</span><output>{deg(selected.status === 'known' ? selected.value : undefined)}</output></div>
    <div><span>Required control moment</span><output>{fmt(required)} N·m</output></div>
    <div><span>Selected moment · estimate</span><output>{fmt(value('estimatedMoment'))} N·m</output></div>
    <div><span>Usable travel · {binding}</span><output>±{deg(usable)}</output></div>
    <div><span>Available moment · nominal</span><output>±{fmt(value('availableMoment'))} N·m</output></div>
  </div><p role="status">{target === undefined || usable === undefined ? 'No finite target solution is available.' : Math.abs(target) > usable ? 'The target needs more travel than is available.' : value('withinEnvelope') === 1 && required !== undefined && value('estimatedMoment') !== undefined && Math.abs(value('estimatedMoment')! - required) < 1e-8 * Math.max(1, Math.abs(required)) ? 'Selected deflection meets the target in the nominal model.' : 'A nominal deflection can meet the target. The selected deflection is a separate input.'}</p>
    <button disabled={target === undefined || usable === undefined || Math.abs(target) > usable} onClick={() => {
      if (target === undefined) return
      const id = crypto.randomUUID()
      const result = store.dispatch({ id, type: 'SET_ELEVATOR', payload: { value: quantity(target, 'rad', id) }, source: 'numeric-input', context: { scenarioId: snapshot.scenarioId, model: null } }, { id, source: 'computed', description: 'Explicitly applied nominal target deflection from C4 inverse model.', derivedFrom: o?.targetAngle?.status === 'known' ? [o.targetAngle.provenanceId] : [] })
      setError(result.ok ? '' : result.error)
    }}>Use nominal target deflection</button>
    {value('withinEnvelope') === 0 && <p role="alert">Selected deflection exceeds usable travel ({binding}). Playback blocked. Requested force estimate: {fmt(value('estimatedForce'))} N; force bound with uncertainty: {fmt(value('estimatedForce') === undefined ? undefined : Math.abs(value('estimatedForce')!) * (1 + (fieldValue('gainUncertainty') ?? 0)))} N versus {fmt(fieldValue('forceLimit'))} N permitted. The aircraft shows a command preview, not an achievable pose.</p>}
    <p>Target acceleration: {fmt(fieldValue('requestedAcceleration'), 3)} rad/s². Selected estimate: {fmt(value('estimatedAcceleration'), 3)} rad/s².</p>
    <details><summary>Compare uncertainty</summary><p>Effectiveness varies by ±{fmt((fieldValue('gainUncertainty') ?? 0) * 100, 0)}%. Available moment falls to ±{fmt(value('guaranteedMoment'))} N·m at the weakest gain; capacity margin is {fmt(margin)} N·m. Required pose at that gain: {targetDegrees(value('worstCaseTargetAngle'))}.</p><p>{margin === undefined ? 'Assessment unavailable.' : margin < 0 ? 'The target is not supported across the full gain range.' : 'Capacity covers the target across the gain range; the same fixed command does not guarantee the target.'}</p></details>
    <details><summary>Model scope</summary><p>Illustrative symmetric limits, fixed-reference equivalent force, no stall or damping. Estimates beyond the declared deflection range are unavailable. Measured aircraft limits and effectiveness are still needed.</p></details>{error && <p role="alert">{error}</p>}
  </section>
}
