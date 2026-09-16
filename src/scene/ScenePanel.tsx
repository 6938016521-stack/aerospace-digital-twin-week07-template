import { Component, lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import type { AircraftStore, StoreSnapshot } from '../platform/state/store'
import type { SurfaceControl } from './aircraft/definition'
import { cgPosition, commitCG, surfacePose } from './bindings'
import './scene.css'
const Viewport = lazy(() => import('./AircraftViewport'))
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p className="scene-fallback">The aircraft scene could not load. Use the controls panel to edit parameters. Reload to retry.</p> : this.props.children }
}
export function ScenePanel({ store, snapshot, showControls = true, hideSceneTools = false, hidePitchVisuals = false, inspector }: { store: AircraftStore; snapshot: StoreSnapshot; showControls?: boolean; hideSceneTools?: boolean; hidePitchVisuals?: boolean; inspector?: (selected: SurfaceControl | '', onSelect: (value: SurfaceControl | '') => void) => ReactNode }) {
  const [axes, setAxes] = useState(true)
  const [transparency, setTransparency] = useState(0)
  const [drag, setDrag] = useState(false)
  const [selected, setSelected] = useState<SurfaceControl | ''>('')
  const [cameraView, setCameraView] = useState({ name: 'Perspective', revision: 0 })
  const [error, setError] = useState('')
  const cg = cgPosition(snapshot.state)
  const supported = typeof WebGL2RenderingContext !== 'undefined'
  return <section className={`scene-panel studio-scene ${showControls ? 'with-inspector' : ''}`} aria-label="Permanent aircraft scene"><div className="scene-stage">

    <div className="scene-toolbar" aria-label="Scene controls">
      {['Perspective', 'Top', 'Side', 'Front'].map((name) => <button key={name} aria-pressed={cameraView.name === name} onClick={() => setCameraView({ name, revision: cameraView.revision + 1 })}>{name}</button>)}
      <label><input type="checkbox" checked={axes} onChange={(e) => setAxes(e.target.checked)} /> Body axes</label>
      <label className="transparency-control">Aircraft transparency <input aria-label="Aircraft transparency" type="range" min="0" max="90" step="5" value={transparency} onChange={(e) => setTransparency(Number(e.target.value))} /> <output>{transparency}%</output></label>
      <label>Highlight surface <select value={selected} onChange={(e) => setSelected(e.target.value as SurfaceControl | '')}><option value="">None</option>{['elevator','aileron','rudder','flap'].map((name) => <option key={name}>{name}</option>)}</select></label>
    </div>
    <div className="scene-viewport"><SceneBoundary><Suspense fallback={<p className="scene-fallback">Loading aircraft scene…</p>}>
      {supported ? <Viewport {...{ store, snapshot, axes, transparency, drag: drag && !hideSceneTools, selected, cameraView, hidePitchVisuals }} onSelect={setSelected} onError={setError} /> : <p className="scene-fallback">WebGL unavailable. Use the controls panel to edit parameters.</p>}
    </Suspense></SceneBoundary><div className="scene-help">{snapshot.lesson?.stageId === 'signed-moment' && snapshot.lesson.prediction !== null && <>Aircraft shows applied force and resulting net moment.<br /></>}{snapshot.state.simulation.status === 'unconfigured' ? 'Drag to orbit · scroll to zoom · cyan marks selection' : 'Suspended pitch rig · force arrows: 250 N/m, capped at 3 m · no translation'}<br />Body axes: red +X forward · green +Y right · blue +Z down</div></div>
    </div><aside id="aircraft-inspector" className="studio-inspector" hidden={!showControls}><div className="inspector-heading"><p className="eyebrow">AEROLAB-01</p><h2>Aircraft & controls</h2></div>{inspector?.(selected, setSelected)}{!hideSceneTools && <details className="scene-tools"><summary>Scene tools & CG marker</summary><div className="scene-details"><div><strong>Surface pose</strong><p>{selected ? `${selected}: ${(surfacePose(snapshot.state, selected).radians * 180 / Math.PI).toFixed(1)}° · ${surfacePose(snapshot.state, selected).source}` : 'Select a surface to inspect its pose.'}</p><p>Selected surfaces are shown in cyan. Unconfigured surfaces use a neutral visual pose.</p></div>
      <div><strong>Center of gravity</strong><p>{cg ? `Body position: ${cg.map((v) => v.toFixed(3)).join(', ')} m` : 'Unconfigured · marker hidden'}</p><button onClick={() => { const result = commitCG(store, snapshot, [0, 0, 0]); setError(result.ok ? '' : result.error) }}>Set CG at visual origin</button> <label><input type="checkbox" disabled={!cg} checked={drag && !!cg} onChange={(e) => setDrag(e.target.checked)} /> Drag CG</label><p>This explicitly supplies an exploratory CG, not a validated mass property.</p></div></div></details>}{error && <p role="alert">{error}</p>}</aside>
  </section>
}
