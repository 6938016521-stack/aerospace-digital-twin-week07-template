import type { SurfaceControl } from '../scene/aircraft/definition'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { AircraftStore, StoreSnapshot } from '../platform/state/store'
import { readQuantity } from '../platform/state/store'
import { SCALAR_COMMANDS } from '../platform/commands/validation'
import type { ScalarCommandType } from '../platform/commands/validation'
import { quantity } from '../platform/units/types'
import type { CanonicalUnit, EngineeringValue } from '../platform/units/types'
import { degreesToRadians, radiansToDegrees } from '../platform/units/conversions'

const LABELS: Record<ScalarCommandType, string> = {
  SET_PITCH_INERTIA: 'Pitch inertia',
  SET_AIRSPEED: 'Airspeed', SET_DENSITY: 'Density', SET_ALPHA: 'Angle of attack', SET_BETA: 'Sideslip',
  SET_ELEVATOR: 'Elevator command', SET_AILERON: 'Aileron command', SET_RUDDER: 'Rudder command',
  SET_FLAP: 'Flap command', SET_THROTTLE: 'Throttle command',
}

function formatQuantity(value: EngineeringValue<CanonicalUnit>): string {
  return value.status === 'known' ? `${Number(value.value.toPrecision(8))} ${value.unit}` : `Unconfigured (${value.unit})`
}

function numberFromText(text: string): number {
  if (!text.trim()) throw new Error('Enter a value; a blank field is not zero.')
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error('Enter a finite number.')
  return value
}

export function ParameterWorkspace({ store, snapshot, surface, onSurfaceSelect, compact = false }: { readonly store: AircraftStore; readonly snapshot: StoreSnapshot; surface?: SurfaceControl | ''; onSurfaceSelect?: (value: SurfaceControl | '') => void; compact?: boolean }) {
  const [parameter, setSelected] = useState<ScalarCommandType>('SET_AIRSPEED')
  const selected = surface ? `SET_${surface.toUpperCase()}` as ScalarCommandType : parameter
  const [draft, setDraft] = useState('')
  const [cg, setCg] = useState({ x: '', y: '', z: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const definition = SCALAR_COMMANDS[selected]
  const current = readQuantity(snapshot.state, definition.path)
  const displayUnit = definition.unit === 'rad' ? 'deg' : definition.unit

  function apply(type: string, payload: unknown, provenanceId?: string) {
    const result = store.dispatch({
      id: crypto.randomUUID(), type, payload, source: 'numeric-input',
      context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null },
    }, provenanceId ? {
      id: provenanceId, source: 'instructor-supplied', derivedFrom: [],
      description: 'Manually entered exploratory value; not a validated aircraft parameter.',
    } : undefined)
    if (!result.ok) throw new Error(result.error)
  }

  function submitScalar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      const provenanceId = `manual-${crypto.randomUUID()}`
      const value = numberFromText(draft)
      apply(selected, { value: quantity(definition.unit === 'rad' ? degreesToRadians(value) : value, definition.unit, provenanceId) }, provenanceId)
      setDraft('')
      setMessage(`${LABELS[selected]} applied and logged.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to apply value.') }
  }

  function submitCg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      const provenanceId = `manual-${crypto.randomUUID()}`
      apply('SET_CG', { position: { frame: 'engineering', unit: 'm', x: numberFromText(cg.x), y: numberFromText(cg.y), z: numberFromText(cg.z) }, provenanceId }, provenanceId)
      setCg({ x: '', y: '', z: '' })
      setMessage('All three CG coordinates applied and logged.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to apply CG.') }
  }

  function reset() {
    setError('')
    setMessage('')
    try {
      apply('RESET_SCENARIO', { scenarioId: snapshot.scenarioId })
      setDraft('')
      setCg({ x: '', y: '', z: '' })
      setMessage('Scenario baseline restored. Experiment history retained.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to reset.') }
  }

  return (
    <div className="parameter-workspace">
      {!compact && <p className="workspace-note">Enter exploratory parameters and inspect the shared state. Surface commands preview articulation; load the C2 example for prescribed-force pitch response.</p>}
      {compact && <div className="surface-buttons" aria-label="Select control surface">{(['elevator','aileron','rudder','flap'] as const).map((name) => <button key={name} aria-pressed={surface === name} onClick={() => { onSurfaceSelect?.(name); setDraft(''); setError(''); setMessage('') }}>{name === 'flap' ? 'Flaps' : name[0]!.toUpperCase() + name.slice(1)}</button>)}</div>}
      <form onSubmit={submitScalar} className="parameter-form" noValidate>
        <label>Parameter<select value={selected} onChange={(event) => { setSelected(event.target.value as ScalarCommandType); onSurfaceSelect?.(''); setDraft(''); setError(''); setMessage('') }}>
          {(Object.keys(LABELS) as ScalarCommandType[]).map((type) => <option key={type} value={type}>{LABELS[type]}</option>)}
        </select></label>
        <label>Value ({displayUnit})<input type="number" step="any" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
        <button type="submit">Apply parameter</button>
      </form>
      {compact && (definition.unit === 'rad' || selected === 'SET_AIRSPEED') && <div className="live-slider"><input aria-label={`${LABELS[selected]} slider`} type="range" min={definition.unit === 'rad' ? -30 : 0} max={definition.unit === 'rad' ? 30 : 100} step={1} value={current.status === 'known' ? Math.max(definition.unit === 'rad' ? -30 : 0, Math.min(definition.unit === 'rad' ? 30 : 100, definition.unit === 'rad' ? radiansToDegrees(current.value) : current.value)) : 0} onChange={(event) => {
        try { const id = `manual-${crypto.randomUUID()}`; const value = Number(event.target.value); apply(selected, { value: quantity(definition.unit === 'rad' ? degreesToRadians(value) : value, definition.unit, id) }, id); setError(''); setMessage('') } catch (failure) { setError(String(failure)) }
      }} /><p>Exploration range {definition.unit === 'rad' ? '−30° to +30°' : '0–100 m/s'} · not aircraft limits</p></div>}
      <div className="canonical-readback">
        <span>{LABELS[selected]} · canonical state</span>
        <output aria-label="Parameter canonical value">{formatQuantity(current)}</output>
        {current.status === 'known' && current.unit === 'rad' && <span>{Number(radiansToDegrees(current.value).toPrecision(8))} deg in display units</span>}
      </div>
      <form onSubmit={submitCg} className="cg-form" noValidate>
        <h3>Centre of gravity · body frame</h3>
        <p>+X forward · +Y right · +Z down. Coordinates reference the aircraft body origin.</p>
        <div className="cg-inputs">{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}>CG {axis} (m)
          <input type="number" step="any" value={cg[axis]} onChange={(event) => setCg({ ...cg, [axis]: event.target.value })} />
        </label>)}</div>
        <button type="submit">Apply CG</button>
        <div className="cg-readback">{(['x', 'y', 'z'] as const).map((axis) => <output key={axis} aria-label={`CG ${axis} canonical`}>{axis.toUpperCase()}: {formatQuantity(snapshot.state.massProperties[`cg${axis.toUpperCase()}` as 'cgX' | 'cgY' | 'cgZ'])}</output>)}</div>
      </form>
      <p className="workspace-note">Surface inputs are commands. Physical surface positions and aerodynamic forces remain unknown until their models are added.</p>
      {!compact && <div className="workspace-actions"><button type="button" className="secondary-button" onClick={reset}>Reset scenario</button><span>Restore the empty baseline</span></div>}
      <p className="session-note">Edits and history stay in this session and clear on page reload.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      {message && <p role="status" className="form-success">{message}</p>}
    </div>
  )
}

export function ExperimentHistory({ snapshot }: { readonly snapshot: StoreSnapshot }) {
  const [pageEnd, setPageEnd] = useState<number | null>(null)
  const end = Math.min(pageEnd ?? snapshot.events.length, snapshot.events.length)
  const start = Math.max(0, end - 20)
  return <section className="experiment-history" aria-labelledby="history-title">
    <div className="section-heading"><h2 id="history-title">Experiment history</h2><span className="count">{snapshot.events.length} accepted commands</span></div>
    {snapshot.events.length > 0 && <nav aria-label="History pages"><button disabled={start === 0} onClick={() => setPageEnd(start)}>Older</button><button disabled={end === snapshot.events.length} onClick={() => setPageEnd(Math.min(snapshot.events.length, end + 20))}>Newer</button><button onClick={() => setPageEnd(null)}>Latest · live</button><span> Showing {start + 1}–{end}; complete history retained.</span></nav>}
    {snapshot.events.length === 0 ? <p>No changes yet. Applied parameters and resets will appear here.</p> :
      <ol>{snapshot.events.slice(start, end).reverse().map((event) => <li key={event.sequence}>
        <div className="event-heading"><strong>#{event.sequence} {event.command.type === 'SET_MODULE_STATE' ? `${event.command.payload.moduleId}: ${event.command.payload.field}` : event.command.type === 'INITIALIZE_PITCH' ? 'Pitch initialized' : event.command.type === 'STEP_SIMULATION' ? 'Pitch step' : event.command.type === 'RUN_SIMULATION' ? 'Pitch running' : event.command.type === 'PAUSE_SIMULATION' ? 'Pitch paused' : event.command.type === 'SET_ACTIVE_MODULES' ? 'Active modules changed' : event.command.type === 'RESET_SCENARIO' ? 'Scenario reset' : event.command.type === 'SET_CG' ? 'CG changed' : LABELS[event.command.type as ScalarCommandType]}</strong><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString()}</time></div>
        {event.changes.map((change) => <p key={change.path}><code>{change.path}</code>: {formatQuantity(change.before)} → {formatQuantity(change.after)}</p>)}
        <p className="event-context">Modules: {event.activeModuleIds.join(', ') || 'none'} · {event.command.source} · {event.command.context.scenarioId} · {event.activeModels.length ? event.activeModels.map((model) => `${model.modelId}@${model.version}`).join(', ') : 'No active model'}</p>
        {event.provenance && <p className="event-context">Source: {event.provenance.description}</p>}
      </li>)}</ol>}
  </section>
}
