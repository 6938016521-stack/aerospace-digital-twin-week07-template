import { AuthorityPanel } from './AuthorityPanel'
import { ElevatorPanel } from './ElevatorPanel'
import { QuantityInput } from './QuantityInput'
import { useState } from 'react'
import type { AircraftStore, StoreSnapshot, EngineeringValue, CanonicalUnit } from '../../platform'
import { quantity, radiansToDegrees } from '../../platform'
import { pitchFields, pitchOutputs } from './pitch-model'
const number = (v: EngineeringValue<CanonicalUnit> | undefined) => v?.status === 'known' ? v.value : undefined
const display = (v: EngineeringValue<CanonicalUnit> | undefined) => v?.status === 'known' ? `${Number(v.value.toPrecision(6))} ${v.unit}` : 'Unconfigured'
export function PitchPanel({ store, snapshot }: { store: AircraftStore; snapshot: StoreSnapshot }) {
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'experiment' | 'setup' | 'calculations' | 'planning'>('experiment')
  const c4 = snapshot.scenarioId === 'c4-authority-example'
  const aero = c4 || snapshot.scenarioId === 'c3-elevator-example'
  const active = aero || snapshot.scenarioId === 'c2-pitch-example'
  const enabled = snapshot.activeModuleIds.includes('controls')
  const canRun = enabled && (!c4 || snapshot.state.loads.pitchMoment.status === 'known')
  const controls = snapshot.state.modules.controls, output = snapshot.state.outputs.controls
  function send(type: string, payload: unknown, sourceId?: string): string | null {
    const result = store.dispatch({ id: crypto.randomUUID(), type, payload, source: 'numeric-input', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } }, sourceId ? { id: sourceId, source: 'instructor-supplied', description: 'Explicit exploratory pitch input.', derivedFrom: [] } : undefined)
    return result.ok ? null : result.error
  }
  function action(type: string, payload: unknown, id?: string) { setError(send(type, payload, id) ?? '') }
  function field(name: string, label: string, unit: CanonicalUnit, current: EngineeringValue<CanonicalUnit> | undefined) {
    return <QuantityInput key={name} label={label} unit={unit} value={number(current)} apply={(v) => { const id = crypto.randomUUID(), value = quantity(v, unit, id); return send(name === 'inertia' ? 'SET_PITCH_INERTIA' : 'SET_MODULE_STATE', name === 'inertia' ? { value } : { moduleId: 'controls', field: name, value }, id) }} />
  }
  const loaders = <><button onClick={() => action('RESET_SCENARIO', { scenarioId: 'c2-pitch-example' })}>Load C2 example</button><button onClick={() => action('RESET_SCENARIO', { scenarioId: 'c3-elevator-example' })}>Load C3 elevator example</button><button onClick={() => action('RESET_SCENARIO', { scenarioId: 'c4-authority-example' })}>Load C4 authority example</button><p>Loading an example replaces engineering inputs; your view is preserved.</p></>
  return <section className="pitch-panel" aria-label="Pitch experiment">
    {!active ? <><h3>Choose an experiment</h3>{loaders}</> : <>
      <div className="pitch-sticky">{!enabled && <p role="status">Controls disabled; settings retained. <button onClick={() => action('SET_ACTIVE_MODULES', { moduleIds: [...snapshot.moduleRoots, 'controls'] })}>Resume controls module</button></p>}<h3>{c4 ? 'Elevator authority' : aero ? 'Elevator effectiveness' : 'Prescribed tail force'}</h3><details className="pitch-playback-disclosure" open={c4 ? undefined : true}><summary>{c4 ? 'Pitch playback · fixed selected deflection' : 'Pitch playback'}</summary>{c4 && <p>Instant ideal-actuator response. Separate rate planning does not govern this animation.</p>}<div className="pitch-playback"><button disabled={!canRun} onClick={() => action(snapshot.state.simulation.status === 'running' ? 'PAUSE_SIMULATION' : 'RUN_SIMULATION', null)}>{snapshot.state.simulation.status === 'running' ? 'Pause pitch' : 'Play pitch'}</button><button disabled={!canRun || snapshot.state.simulation.status === 'running'} onClick={() => action('STEP_SIMULATION', null)}>Step 0.02 s</button><button onClick={() => { const id = crypto.randomUUID(); action('INITIALIZE_PITCH', { value: quantity(0.02, 's', id) }, id) }}>Reinitialize pitch</button></div>
      <div className="pitch-readback"><span>Net moment: {display(snapshot.state.loads.pitchMoment)}</span><span>Achieved acceleration: {display(output?.achievedAcceleration)}</span><strong>{snapshot.state.motion.pitch.status === 'known' ? radiansToDegrees(snapshot.state.motion.pitch.value).toFixed(2) : '—'}° pitch · {display(snapshot.state.simulation.elapsedTime)}</strong></div>
      </details><nav className="experiment-tabs" aria-label="Experiment sections">{(c4 ? ['experiment', 'setup', 'planning', 'calculations'] as const : ['experiment', 'setup', 'calculations'] as const).map((name) => <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name === 'experiment' ? 'Inputs' : name === 'setup' ? 'Model setup' : name === 'planning' ? 'Rate plan' : 'Calculations'}</button>)}</nav></div>
      {tab === 'experiment' && <>{aero ? <ElevatorPanel store={store} snapshot={snapshot} /> : field('tailForce', pitchFields.tailForce.label, 'N', controls?.tailForce)}{field('requestedAcceleration', pitchFields.requestedAcceleration.label, 'rad/s^2', controls?.requestedAcceleration)}{c4 ? <AuthorityPanel store={store} snapshot={snapshot} /> : field('inertia', 'Pitch inertia', 'kg*m^2', snapshot.state.massProperties.pitchInertia)}<p>Set applies an input and pauses playback. Target acceleration calculates required moment; it does not impose motion. Open the plots in the bottom dock.</p></>}
      {tab === 'planning' && <AuthorityPanel store={store} snapshot={snapshot} planning />}
      {tab === 'setup' && <>{c4 && field('inertia', 'Pitch inertia', 'kg*m^2', snapshot.state.massProperties.pitchInertia)}{field('tailStation', pitchFields.tailStation.label, 'm', controls?.tailStation)}{field('competingMoment', pitchFields.competingMoment.label, 'N*m', controls?.competingMoment)}<QuantityInput label="CG X (m)" unit="m" value={number(snapshot.state.massProperties.cgX)} apply={(x) => {
        const y = number(snapshot.state.massProperties.cgY), z = number(snapshot.state.massProperties.cgZ)
        if (y === undefined || z === undefined) return 'Configure all CG coordinates first.'
        const id = crypto.randomUUID(); return send('SET_CG', { position: { frame: 'engineering', unit: 'm', x, y, z }, provenanceId: id }, id)
      }} />{aero && <ElevatorPanel store={store} snapshot={snapshot} section="setup" />}<>{c4 && <AuthorityPanel store={store} snapshot={snapshot} setup />}</><p>All experiments use My=(CGx−tailX)Fz. C3 derives Fz from its fixed-reference moment with no residual tail couple.</p><details><summary>Load a different example</summary>{loaders}</details></>}
      {tab === 'calculations' && <>{aero && <ElevatorPanel store={store} snapshot={snapshot} section="calculations" />}<div className="pitch-results"><p>Required My = Iy × target − competing</p>{Object.entries(pitchOutputs).map(([name, config]) => <div key={name}><span>{config.label}</span><output aria-label={config.label}>{display(output?.[name])}</output></div>)}</div><p>Positive moment is nose-up. Inertia × achieved acceleration = net moment.</p></>}
      <p>Illustrative only · no damping or translation. Stops exactly at ±30° using a shortened final step; not an aircraft validity limit.</p><button onClick={() => action('RESET_SCENARIO', { scenarioId: 'parameter-workspace' })}>Return to empty workspace</button>
    </>}{error && <p role="alert">{error}</p>}
  </section>
}
