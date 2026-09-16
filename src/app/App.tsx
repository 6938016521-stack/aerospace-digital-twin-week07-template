import { Week07Lab } from '../student/Week07Lab'
import { Week07Demonstration } from './Week07Demonstration'
import { ElevatorPlots } from '../modules/controls/ElevatorPlots'
import { PitchHistory } from '../modules/controls/PitchHistory'
import { PitchPanel } from '../modules/controls/PitchPanel'
import { usePitchPlayback } from './usePitchPlayback'
import { ControlsPanel } from '../modules/controls/ControlsPanel'
import { ModuleRuntimePanel } from './ModuleRuntimePanel'
import { ScenePanel } from '../scene/ScenePanel'
import { PLATFORM_API_VERSION } from '../platform/version'
import { useState, useSyncExternalStore } from 'react'
import { CANONICAL_QUANTITY_IDS } from '../platform/state/quantities'
import type { AppCatalog } from './catalog'
import type { AircraftStore } from '../platform/state/store'
import { readQuantity } from '../platform/state/store'
import { createParameterStore } from './parameter-workspace'
import { ParameterWorkspace, ExperimentHistory } from './ParameterWorkspace'
import { LessonPanel } from '../modules/controls/LessonPanel'
import './studio.css'

export function App({ catalog, store }: { readonly catalog: AppCatalog; readonly store?: AircraftStore }) {
  const [defaultStore] = useState(createParameterStore)
  const activeStore = store ?? defaultStore
  const snapshot = useSyncExternalStore(activeStore.subscribe, activeStore.getSnapshot, activeStore.getSnapshot)
  usePitchPlayback(activeStore, snapshot.state.simulation.status === 'running')
  const [showControls, setShowControls] = useState(true)
  const [plotScale, setPlotScale] = useState(15000)
  const [authorityScale, setAuthorityScale] = useState(5000)
  const [dock, setDock] = useState<'history' | 'response' | 'effectiveness' | 'modules' | 'course' | null>(null)
  const [error, setError] = useState('')
  const missingCount = CANONICAL_QUANTITY_IDS.filter((id) => readQuantity(snapshot.state, id).status === 'unconfigured').length
  const modules = catalog.modules.list()
  const lessons = catalog.lessons.list()
  const activeLesson = snapshot.lesson ? lessons.find((lesson) => lesson.id === snapshot.lesson!.lessonId) : undefined
  const resetKey = snapshot.events.filter((event) => event.command.type === 'RESET_SCENARIO').at(-1)?.sequence ?? 0
  const pitchActive = ['c2-pitch-example', 'c3-elevator-example', 'c4-authority-example'].includes(snapshot.scenarioId)
  function reset() {
    const result = activeStore.dispatch({ id: crypto.randomUUID(), type: 'RESET_SCENARIO', payload: { scenarioId: snapshot.scenarioId }, source: 'pointer', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } })
    setError(result.ok ? '' : result.error)
  }
  function startLesson(lessonId: string) {
    const result = activeStore.dispatch({ id: crypto.randomUUID(), type: 'START_LESSON', payload: { lessonId }, source: 'lesson', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } })
    setError(result.ok ? '' : result.error)
    if (result.ok) { setShowControls(true); setDock(null) }
  }
  const predictionPending = !!snapshot.lesson && snapshot.lesson.prediction === null
  const dockItems = activeLesson ? ['history', 'course'] as const : ['history', 'response', 'effectiveness', 'modules', 'course'] as const
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '')
  if (hash === '#week07') return <Week07Lab />
  if (hash.startsWith('#demo=')) return <Week07Demonstration name={hash.slice(6)} />
  return <div className="studio">
    <header className="studio-header"><span className="studio-logo" aria-hidden="true">✈</span><h1>Aerospace Digital Twin</h1><span className="studio-mode">{activeLesson ? 'Guided lesson' : 'Exploratory workspace'}</span><div className="header-actions"><a className="week07-launch" href="#week07">Start Week07 lab</a><a href="/teaching/week07/student.html" target="week07-lecture">Week07 lecture</a>{!activeLesson && lessons[0] && <button onClick={() => startLesson(lessons[0]!.id)}>Start Week06 lesson</button>}<button aria-expanded={showControls} aria-controls="aircraft-inspector" onClick={() => setShowControls(!showControls)}>{showControls ? 'Hide controls' : 'Show controls'}</button>{!activeLesson && <button onClick={reset}><span aria-hidden="true">↺ </span><span>Reset scenario</span></button>}</div></header>
    <main className="studio-main">
      <ScenePanel store={activeStore} snapshot={snapshot} showControls={showControls} hideSceneTools={!!activeLesson} hidePitchVisuals={predictionPending} inspector={(selected, onSelect) => activeLesson ? <LessonPanel key={`${snapshot.lesson!.stageId}-${resetKey}`} store={activeStore} snapshot={snapshot} lesson={activeLesson} /> : <><PitchPanel key={resetKey} store={activeStore} snapshot={snapshot} />{!pitchActive && <><ControlsPanel store={activeStore} snapshot={snapshot} selected={selected} onSelect={onSelect} /><details open={!snapshot.activeModuleIds.includes('controls')}><summary>Aircraft parameters & CG</summary><ParameterWorkspace key={selected} store={activeStore} snapshot={snapshot} surface={selected} onSurfaceSelect={onSelect} compact /></details></>}</>} />
      <section className="studio-dock" aria-label="Workspace dock">
        <nav aria-label="Workspace panels">{dockItems.map((item) => <button key={item} disabled={predictionPending && item !== 'course'} aria-expanded={dock === item} aria-controls="dock-content" onClick={() => setDock(dock === item ? null : item)}>{item === 'history' ? `Experiment history · ${snapshot.events.length}` : item === 'response' ? 'Pitch response' : item === 'effectiveness' ? 'Elevator plots' : item === 'modules' ? 'Modules' : 'Course & status'}<span aria-hidden="true">{dock === item ? '⌄' : '⌃'}</span></button>)}<span className="dock-hint">{predictionPending ? 'Submit prediction to unlock readings' : 'Adjust · observe · explore'}</span></nav>
        {dock && <div id="dock-content" className="dock-content">
          {predictionPending ? <p>Submit your prediction to unlock workspace readings.</p> : <>{dock === 'effectiveness' && <ElevatorPlots snapshot={snapshot} scale={snapshot.scenarioId === 'c4-authority-example' ? authorityScale : plotScale} onScaleChange={snapshot.scenarioId === 'c4-authority-example' ? setAuthorityScale : setPlotScale} />}
          {dock === 'response' && <PitchHistory snapshot={snapshot} />}
          {dock === 'history' && <ExperimentHistory snapshot={snapshot} />}
          {dock === 'modules' && <ModuleRuntimePanel key={'runtime-' + resetKey} store={activeStore} snapshot={snapshot} />}
          {dock === 'course' && <>
          <aside className="catalog-panel" aria-label="Course catalogs">
            <div className="catalog-empty"><h3>{snapshot.state.simulation.status === 'unconfigured' ? 'Aircraft physics not configured' : 'Single-axis pitch experiment'}</h3><p>Geometry is illustrative. C2 uses prescribed forces; C3 adds an illustrative linear elevator moment model. Neither is calibrated aircraft behavior.</p></div>
            <section aria-labelledby="modules-title">
              <div className="section-heading">
                <h2 id="modules-title">Engineering modules</h2>
                <span className="count">{modules.length.toString().padStart(2, '0')}</span>
              </div>
              {modules.length === 0 ? (
                <div className="catalog-empty"><h3>No modules registered</h3><p>The platform can start with an empty module catalog.</p></div>
              ) : (
                <ul className="module-list">
                  {modules.map((module) => (
                    <li className="module-card" key={module.id}>
                      <div className="module-meta"><span>MODULE / {module.id.toUpperCase()}</span><span>v{module.version}</span></div>
                      <h3>{module.title}</h3>
                      <p>{module.description}</p>
                      <span className="implementation-badge">{module.implementation === 'not-implemented' ? 'Not implemented' : 'Descriptor provided'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="lessons-section" aria-labelledby="lessons-title">
              <div className="section-heading"><h2 id="lessons-title">Lessons</h2><span className="count">{lessons.length.toString().padStart(2, '0')}</span></div>
              {lessons.length === 0 ? (
                <div className="catalog-empty"><h3>No lessons registered</h3><p>Teaching stages and curated scenarios will be added with their engineering modules.</p></div>
              ) : (
                <ul className="lesson-list">{lessons.map((lesson) => <li key={lesson.id}><span>{lesson.title}<small>v{lesson.version}</small></span><button disabled={!!activeLesson} onClick={() => startLesson(lesson.id)}>Start Week06 lesson</button></li>)}</ul>
              )}
            </section>
          </aside>
            <p>No student model supplied</p><p>No engineering record supplied</p><p>{snapshot.state.simulation.status === 'unconfigured' ? 'No physics model is running' : `Pitch simulation: ${snapshot.state.simulation.status}`}</p>
          </>}</>}
        </div>}
      </section>
    </main>
    <footer className="studio-status"><span><i /> {snapshot.state.simulation.status === 'unconfigured' ? 'Command preview · physics not running' : `Single-axis pitch · ${snapshot.state.simulation.status}`}</span><span>{missingCount} unconfigured</span><span>PLATFORM API {PLATFORM_API_VERSION}</span></footer>
    {error && <p className="studio-error" role="alert">{error}</p>}
  </div>
}

function subscribeHash(callback: () => void) { window.addEventListener('hashchange', callback); return () => window.removeEventListener('hashchange', callback) }
function readHash() { return window.location.hash }
