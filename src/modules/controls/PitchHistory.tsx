import type { StoreSnapshot } from '../../platform'
export function PitchHistory({ snapshot }: { snapshot: StoreSnapshot }) {
  let reset = -1
  snapshot.events.forEach((event, index) => {
    if (['RESET_SCENARIO', 'INITIALIZE_PITCH'].includes(event.command.type)) reset = index
  })
  let pitch = 0, time = 0
  const samples = [{ pitch, time }]
  for (const event of snapshot.events.slice(reset + 1)) {
    if (event.command.type !== 'STEP_SIMULATION') continue
    for (const change of event.changes) {
      if (change.after.status !== 'known') continue
      if (change.path === 'motion.pitch') pitch = change.after.value * 180 / Math.PI
      if (change.path === 'simulation.elapsedTime') time = change.after.value
    }
    samples.push({ pitch, time })
  }
  const end = Math.max(1, time), extent = Math.max(5, ...samples.map((sample) => Math.abs(sample.pitch)))
  const points = samples.map((sample) => `${45 + sample.time / end * 620},${95 - sample.pitch / extent * 65}`).join(' ')
  return <section aria-label="Pitch response history"><h2>Pitch response · current run</h2><p>Recorded fixed-step response, not the requested target. Reinitialize starts a new trace.</p><svg viewBox="0 0 700 190" role="img" aria-label="Pitch angle in degrees versus simulation time in seconds" style={{ width: '100%', maxWidth: 760, height: 160 }}>
    <line x1="45" y1="95" x2="665" y2="95" stroke="#b5cdd0" /><line x1="45" y1="25" x2="45" y2="165" stroke="#b5cdd0" /><polyline points={points} fill="none" stroke="#008a99" strokeWidth="2" />
    <g fontSize="10" fill="#597980"><text x="0" y="30">+{extent.toFixed(1)}°</text><text x="4" y="99">0°</text><text x="0" y="165">−{extent.toFixed(1)}°</text><text x="45" y="185">0 s</text><text x="620" y="185">{end.toFixed(2)} s</text></g>
  </svg></section>
}
