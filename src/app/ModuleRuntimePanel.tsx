import { useState } from 'react'
import type { AircraftStore, StoreSnapshot } from '../platform'
export function ModuleRuntimePanel({ store, snapshot }: { store: AircraftStore; snapshot: StoreSnapshot }) {
  const [message, setMessage] = useState('')
  const runtime = store.getRuntime()
  if (!runtime) return null
  return <section className="scene-panel" aria-label="Module runtime"><div className="scene-heading"><div><p className="eyebrow">P3 · MODULE RUNTIME</p><h2>Engineering modules in action</h2></div><span>Execution order: {snapshot.activeModuleIds.join(' → ') || 'None enabled'}</span></div>
    <div className="scene-details">{runtime.list().map((module) => {
      const enabled = snapshot.moduleRoots.includes(module.id)
      return <div key={module.id}><h3>{module.title}</h3><p>{module.description}</p><button onClick={() => {
        const result = store.dispatch({ id: crypto.randomUUID(), type: 'SET_ACTIVE_MODULES', payload: { moduleIds: enabled ? snapshot.moduleRoots.filter((id) => id !== module.id) : [...snapshot.moduleRoots, module.id] }, source: 'pointer', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } })
        setMessage(result.ok ? `${module.title} ${enabled ? 'disabled' : 'enabled'}.` : result.error)
      }}>{enabled ? 'Disable' : 'Enable'} {module.title}</button> <button onClick={() => setMessage(runtime.verify(module.id).map((result) => `${result.passed ? 'PASS' : 'FAIL'} · ${result.detail}`).join(' '))}>Verify {module.title}</button></div>
    })}
    {runtime.visualizations(snapshot.activeModuleIds).map((visual) => {
      const [, owner, name] = visual.outputId.split('.')
      const value = snapshot.state.outputs[owner!]?.[name!]
      return <div key={visual.id}><strong>{visual.title}</strong><p>{value?.status === 'known' ? `${value.value} ${value.unit}` : 'Unconfigured · supply airspeed in the parameter workspace'}</p><p>Registered module output · no flight response implied</p></div>
    })}</div><p role="status" style={{ padding: '0 26px 20px' }}>{message}</p></section>
}
