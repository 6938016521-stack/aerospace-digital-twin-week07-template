import { useEffect } from 'react'
import type { AircraftStore } from '../platform'
/** Real time only schedules fixed kernel steps; it never supplies physical dt. */
export function usePitchPlayback(store: AircraftStore, running: boolean, maxDuration?: number) {
  useEffect(() => {
    if (!running) return
    const dt = store.getSnapshot().state.simulation.timeStep
    if (dt.status !== 'known') return
    const timer = window.setInterval(() => {
      const snapshot = store.getSnapshot()
      if (snapshot.state.simulation.status !== 'running') return
      const beforeStep = snapshot.state.simulation.elapsedTime
      if (maxDuration !== undefined && beforeStep.status === 'known' && beforeStep.value >= maxDuration) {
        store.dispatch({ id: crypto.randomUUID(), type: 'PAUSE_SIMULATION', payload: null, source: 'system', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } })
        return
      }
      const envelope = { id: crypto.randomUUID(), payload: null, source: 'system', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } }
      const result = store.dispatch({ ...envelope, type: 'STEP_SIMULATION' })
      if (!result.ok) store.dispatch({ ...envelope, id: crypto.randomUUID(), type: 'PAUSE_SIMULATION' })
      else {
        const elapsed = store.getSnapshot().state.simulation.elapsedTime
        if (maxDuration !== undefined && elapsed.status === 'known' && elapsed.value >= maxDuration) {
          store.dispatch({ ...envelope, id: crypto.randomUUID(), type: 'PAUSE_SIMULATION' })
        }
      }
    }, dt.value * 1000)
    return () => window.clearInterval(timer)
  }, [store, running, maxDuration])
}
