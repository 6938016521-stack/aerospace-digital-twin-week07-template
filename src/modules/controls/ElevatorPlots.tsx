import { AuthorityPlot } from './AuthorityPlot'
import { useId } from 'react'
import type { StoreSnapshot, EngineeringValue, CanonicalUnit } from '../../platform'
import { elevatorEffect, transferElevatorMoment } from './elevator-model'
const known = (v: EngineeringValue<CanonicalUnit> | undefined) => v?.status === 'known' ? v.value : undefined
export function ElevatorPlots({ snapshot, scale, onScaleChange }: { snapshot: StoreSnapshot; scale: number; onScaleChange: (scale: number) => void }) {
  const clip = useId().replaceAll(':', '')
  if (snapshot.scenarioId === 'c4-authority-example') return <AuthorityPlot snapshot={snapshot} scale={scale} onScaleChange={onScaleChange} />
  const s = snapshot.state, f = s.modules.controls
  const inputs = [known(s.environment.density), known(s.motion.airspeed), known(f?.referenceArea), known(f?.referenceChord), known(f?.elevatorDerivative), known(s.controls.elevatorCommanded), known(f?.referenceStation), known(f?.tailStation), known(s.massProperties.cgX)]
  if (!snapshot.activeModuleIds.includes('controls') && snapshot.scenarioId === 'c3-elevator-example') return <p>Controls disabled; saved model settings will be used when you resume the module.</p>
  if (snapshot.scenarioId !== 'c3-elevator-example' || inputs.some((x) => x === undefined)) return <p>Load the C3 elevator example to inspect its moment curves.</p>
  const [rho, speed, area, chord, derivative, angle, reference, tail, cg] = inputs as number[]
  const moment = (v: number, a: number) => transferElevatorMoment(elevatorEffect(rho!, v, area!, chord!, derivative!, a).deltaMoment, reference!, tail!, cg!).momentAtCG
  function plot(vary: 'angle' | 'speed') {
    const min = vary === 'angle' ? -10 : 0, max = vary === 'angle' ? 10 : 80
    const unit = vary === 'angle' ? 'deg' : 'm/s'
    const currentX = vary === 'angle' ? angle! * 180 / Math.PI : speed!
    const xs = Array.from({ length: 81 }, (_, i) => min + i / 80 * (max - min))
    let ys: number[], currentY: number
    try { ys = xs.map((x) => moment(vary === 'speed' ? x : speed!, vary === 'angle' ? x * Math.PI / 180 : angle!)); currentY = moment(speed!, angle!) } catch { return <p>Curve exceeds finite model arithmetic.</p> }
    const x = (v: number) => 62 + (v - min) / (max - min) * 400, y = (v: number) => 110 - v / scale * 75
    const inView = currentX >= min && currentX <= max && Math.abs(currentY) <= scale
    return <figure className="elevator-plot"><figcaption>Elevator contribution ΔM about CG vs {vary === 'angle' ? 'elevator' : 'airspeed'}</figcaption><svg viewBox="0 0 490 230" role="img" aria-label={`Elevator moment versus ${vary}`} data-scale={scale}>
      <defs><clipPath id={`${clip}-${vary}`}><rect x="62" y="35" width="400" height="150" /></clipPath></defs>
      {[-scale, -scale / 2, 0, scale / 2, scale].map((v) => <g key={v}><line x1="62" x2="462" y1={y(v)} y2={y(v)} stroke="#c6d9dd" /><text x="57" y={y(v) + 4} textAnchor="end" fontSize="10">{v}</text></g>)}
      {[min, (min + max) / 2, max].map((v) => <text key={v} x={x(v)} y="203" textAnchor="middle" fontSize="11">{v}</text>)}
      <text x="62" y="20" fontSize="11">Elevator ΔM (N·m)</text><text x="262" y="223" textAnchor="middle" fontSize="11">{vary === 'angle' ? 'Elevator' : 'Airspeed'} ({unit})</text>
      <g clipPath={`url(#${clip}-${vary})`}><polyline points={ys.map((v, i) => `${x(xs[i]!)},${y(v)}`).join(' ')} fill="none" stroke="#008a99" strokeWidth="2" />{inView && <circle aria-label="Current operating point" cx={x(currentX)} cy={y(currentY)} r="5" fill="#c24c26" />}</g>
    </svg><p>Current: {currentX.toFixed(2)} {unit}, {currentY.toFixed(1)} N·m{!inView && ' · outside plot window'}</p>{ys.some((v) => Math.abs(v) > scale) && <p>Curve clipped at the selected scale.</p>}</figure>
  }
  return <section aria-label="Elevator plots"><div className="plot-heading"><h2>Elevator effectiveness</h2><label>Vertical scale (±N·m)<select value={scale} onChange={(e) => onScaleChange(Number(e.target.value))}>{[1000, 5000, 15000, 50000].map((v) => <option key={v}>{v}</option>)}</select></label></div><p>Elevator contribution only; net moment also includes the competing moment. Fixed scale for comparison; orange marks the current state. Windows are not aircraft limits.</p><div className="elevator-plots">{plot('angle')}{plot('speed')}</div></section>
}
