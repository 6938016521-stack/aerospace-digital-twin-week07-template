import { useState } from 'react'
import type { AircraftStore, StoreSnapshot } from '../../platform'
import { quantity, degreesToRadians, radiansToDegrees } from '../../platform'
import { controlNames } from './descriptor'
type Surface = typeof controlNames[number]
const directions: Record<Surface, string> = {
  elevator: 'Positive: both elevator trailing edges move down.',
  aileron: 'Positive: left trailing edge down, right trailing edge up.',
  rudder: 'Positive: rudder trailing edge moves right.',
  flap: 'Positive: both flap trailing edges move down.',
}
export function ControlsPanel({ store, snapshot, selected, onSelect }: { store: AircraftStore; snapshot: StoreSnapshot; selected: Surface | ''; onSelect: (surface: Surface) => void }) {
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Partial<Record<Surface, string>>>({})
  const enabled = snapshot.activeModuleIds.includes('controls')
  const focus = selected || 'elevator'
  function command(surface: Surface, degrees: number, source: 'numeric-input' | 'pointer' = 'numeric-input') {
    try {
      const id = crypto.randomUUID()
      const result = store.dispatch({ id, type: `SET_${surface.toUpperCase()}`, source, context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null }, payload: { value: quantity(degreesToRadians(degrees), 'rad', id) } }, { id, source: 'instructor-supplied', description: 'C1 illustrative surface command; not a physical limit or aerodynamic result.', derivedFrom: [] })
      if (!result.ok) throw new Error(result.error)
      setDrafts((current) => ({ ...current, [surface]: undefined })); onSelect(surface); setError('')
    } catch (failure) { setError(String(failure)) }
  }
  return <section className="controls-lesson" aria-label="Controls visual module">
    {!enabled ? <><button onClick={() => {
      const result = store.dispatch({ id: crypto.randomUUID(), type: 'SET_ACTIVE_MODULES', source: 'pointer', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null }, payload: { moduleIds: [...snapshot.moduleRoots, 'controls'] } })
      setError(result.ok ? '' : result.error)
      if (result.ok) onSelect('elevator')
    }}>Start controls exploration</button><p>Four surface controls and instructor demonstrations.</p></> : <>
      <p className="eyebrow">C1 · CONTROL SURFACES</p>
      {controlNames.map((name) => {
        const value = snapshot.state.controls[`${name}Commanded`]
        const degrees = value.status === 'known' ? Number(radiansToDegrees(value.value).toPrecision(8)) : null
        return <div className="control-row" key={name}>
          <div className="control-row-heading"><button aria-pressed={focus === name} onClick={() => onSelect(name)}>Focus {name}</button><span>{degrees === null ? 'Unconfigured' : `${degrees}°`}</span></div>
          <input aria-label={`${name} deflection slider`} type="range" min="-30" max="30" step="1" value={Math.max(-30, Math.min(30, degrees ?? 0))} onChange={(event) => command(name, Number(event.target.value), 'pointer')} />
          <form onSubmit={(event) => { event.preventDefault(); const draft = drafts[name]; if (draft === undefined || !draft.trim()) { setError('Enter an angle; a blank field is not zero.'); return } command(name, Number(draft)) }}>
            <label>{name} angle (deg)<input type="number" step="any" placeholder={degrees === null ? 'Not set' : String(degrees)} value={drafts[name] ?? ''} onChange={(event) => setDrafts({ ...drafts, [name]: event.target.value })} /></label><button>Apply {name}</button>
          </form>
        </div>
      })}
      <p className="control-note">Slider range ±30° is for exploration, not aircraft limits. Numeric entry accepts other finite angles.</p>
      <div className="instructor-controls"><h3>Instructor demonstration</h3><p>{directions[focus]}</p><div>{[-10, 0, 10].map((angle) => <button key={angle} onClick={() => command(focus, angle, 'pointer')}>{angle === 0 ? 'Neutral' : `${angle > 0 ? '+' : '−'}10°`} {focus}</button>)}</div><p>Changes the shared surface command. In the C3 example, elevator commands also update pitching moment.</p></div>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>
}
