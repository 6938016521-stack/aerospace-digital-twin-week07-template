import { useEffect } from 'react'
import type { AircraftStore } from '../platform'
/** Real time only schedules fixed kernel steps; it never supplies physical dt. */
export function usePitchPlayback(store: AircraftStore, running: boolean) {
  useEffect(() => {
    if (!running) return
    const dt = store.getSnapshot().state.simulation.timeStep
    if (dt.status !== 'known') return
    const timer = window.setInterval(() => {
      const snapshot = store.getSnapshot()
      if (snapshot.state.simulation.status !== 'running') return
      const envelope = { id: crypto.randomUUID(), payload: null, source: 'system', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } }
      const result = store.dispatch({ ...envelope, type: 'STEP_SIMULATION' })
      if (!result.ok) store.dispatch({ ...envelope, id: crypto.randomUUID(), type: 'PAUSE_SIMULATION' })
    }, dt.value * 1000)
    return () => window.clearInterval(timer)
  }, [store, running])
}
