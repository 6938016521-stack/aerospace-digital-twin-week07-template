import { useId, useState } from 'react'
import type { StoreSnapshot } from '../../platform'
import { authorityFields, authorityAssessment, type AuthorityLimits } from './authority-model'
export function AuthorityPlot({ snapshot, scale, onScaleChange }: { snapshot: StoreSnapshot; scale: number; onScaleChange: (scale: number) => void }) {
  const clip = useId().replaceAll(':', '')
  const [uncertainty, setUncertainty] = useState(false)
  const [planning, setPlanning] = useState(false)
  const s = snapshot.state, f = s.modules.controls
  if (!snapshot.activeModuleIds.includes('controls')) return <p>Controls disabled; resume the module to assess authority.</p>
  const limits = Object.fromEntries(Object.keys(authorityFields).map(k => [k, f?.[k]?.status === 'known' ? f[k].value : undefined]))
  const inputs = [s.environment.density, s.motion.airspeed, f?.referenceArea, f?.referenceChord, f?.elevatorDerivative, f?.referenceStation, f?.tailStation, s.massProperties.cgX, s.massProperties.pitchInertia, f?.requestedAcceleration, f?.competingMoment, s.controls.elevatorCommanded]
  if (Object.values(limits).some(v => v === undefined) || inputs.some(v => v?.status !== 'known')) return <p>Configure C4 model inputs and limits to show its envelope.</p>
  const [rho, speed, area, chord, derivative, ref, tail, cg, inertia, target, competing, angle] = inputs.map(v => v?.status === 'known' ? v.value : 0) as number[]
  const l = limits as AuthorityLimits
  const required = inertia! * target! - competing!
  const a = authorityAssessment(l, 0.5 * rho! * speed! ** 2 * area! * chord! * derivative! / (ref! - tail!), cg! - tail!, required, angle!)
  const extent = Math.max(l.geometricLimit, l.actuatorLimit, l.validityLimit, l.kneeAngle)
  const xs = [...new Set([...Array.from({ length: 161 }, (_, i) => -extent + i / 160 * extent * 2), -a.usableAngle, a.usableAngle, -l.kneeAngle, l.kneeAngle, -l.validityLimit, l.validityLimit])].sort((a,b) => a-b)
  const x = (v: number) => 62 + (v + extent) / (2 * extent) * 400, y = (v: number) => 110 - v / scale * 75
  const within = xs.filter(v => Math.abs(v) <= a.usableAngle)
  const line = (vs: number[], gain = 1) => vs.map(v => `${x(v)},${y(a.moment(v) * gain)}`).join(' ')
  const band = [...within.map(v => `${x(v)},${y(a.moment(v) * (1 - l.gainUncertainty))}`), ...[...within].reverse().map(v => `${x(v)},${y(a.moment(v) * (1 + l.gainUncertainty))}`)].join(' ')
  const degrees = (v: number) => (v * 180 / Math.PI).toFixed(2)
  const pointVisible = Math.abs(angle!) <= l.validityLimit && Math.abs(angle!) <= extent && Math.abs(a.moment(angle!)) <= scale
  return <section aria-label="Authority envelope plot"><div className="plot-heading"><h2>Required versus available moment</h2><label>Vertical scale (±N·m)<select value={scale} onChange={e => onScaleChange(Number(e.target.value))}>{[1000, 5000, 15000, 50000].map(v => <option key={v}>{v}</option>)}</select></label></div>
    <div className="authority-plot-options"><label><input type="checkbox" checked={uncertainty} onChange={e => setUncertainty(e.target.checked)} />Compare uncertainty band</label><label><input type="checkbox" checked={planning} onChange={e => setPlanning(e.target.checked)} />Show separate rate-plan interval</label></div>
    <div className="elevator-plots"><figure className="elevator-plot"><svg viewBox="0 0 490 230" role="img" aria-label="Elevator authority versus deflection" data-scale={scale}><defs><clipPath id={clip}><rect x="62" y="35" width="400" height="150" /></clipPath></defs><rect x="62" y="35" width="400" height="150" fill="#eadcda" /><rect x={x(-a.usableAngle)} y="35" width={x(a.usableAngle) - x(-a.usableAngle)} height="150" fill="#d9f0eb" />{[-scale, 0, scale].map(v => <g key={v}><line x1="62" x2="462" y1={y(v)} y2={y(v)} stroke="#adbfc3" /><text x="57" y={y(v) + 4} textAnchor="end" fontSize="10">{v}</text></g>)}<g clipPath={`url(#${clip})`}>
      {uncertainty && <polygon aria-label="Bounded effectiveness uncertainty" points={band} fill="#008a99" opacity="0.22" />}
      <polyline points={line(xs.filter(v => Math.abs(v) <= l.validityLimit))} fill="none" stroke="#777" strokeDasharray="4 4" /><polyline points={line(within)} fill="none" stroke="#008a99" strokeWidth="2" />
      {[-a.usableAngle, a.usableAngle].map(v => <line key={v} x1={x(v)} x2={x(v)} y1="35" y2="185" stroke="#35765b" />)}
      {[-l.kneeAngle, l.kneeAngle].map(v => <circle key={v} cx={x(v)} cy={y(a.moment(v))} r="3" fill="#008a99" />)}
      <line x1="62" x2="462" y1={y(required)} y2={y(required)} stroke="#7545a1" strokeDasharray="6 3" />
      {a.targetAngle !== null && Math.abs(a.targetAngle) <= l.validityLimit && <g aria-label="Required nominal deflection"><line x1={x(a.targetAngle)} x2={x(a.targetAngle)} y1={y(required)} y2="185" stroke="#7545a1" strokeDasharray="2 2" /><circle cx={x(a.targetAngle)} cy={y(required)} r="4" fill="#7545a1" /></g>}
      {pointVisible && <circle aria-label="Selected command estimate" cx={x(angle!)} cy={y(a.moment(angle!))} r="5" fill={a.withinEnvelope ? '#c24c26' : 'white'} stroke="#c24c26" strokeWidth="2" />}
      {planning && a.reachableMin !== null && a.reachableMax !== null && <line aria-label="Separate planning reachable interval" x1={x(a.reachableMin)} x2={x(a.reachableMax)} y1="178" y2="178" stroke="#365ac8" strokeWidth="5" />}
    </g>{[-extent, 0, extent].map(v => <text key={v} x={x(v)} y="202" fontSize="11" textAnchor="middle">{degrees(v)}</text>)}<text x="62" y="20" fontSize="11">Elevator contribution about CG (N·m)</text><text x="262" y="223" fontSize="11" textAnchor="middle">Elevator (deg)</text></svg><figcaption>Purple: target {a.targetAngle === null ? 'unavailable' : `${degrees(a.targetAngle)}°`} · orange: selected {degrees(angle!)}° · green: usable · red: excluded.</figcaption></figure>
      <div><p><strong>Required {required.toFixed(0)} N·m · available ±{a.availableMoment.toFixed(0)} N·m nominal.</strong></p><p>Binding: {a.binding.join(', ')}. Usable travel ±{degrees(a.usableAngle)}°; effectiveness knee ±{degrees(l.kneeAngle)}°.</p><table className="authority-limit-table"><caption>Each restriction, expressed as travel</caption><tbody>{Object.entries(a.restrictions).map(([name, v]) => <tr key={name}><th>{name}</th><td>{Number.isFinite(v) ? `±${degrees(v)}°` : 'Does not bind this model'}</td></tr>)}</tbody></table>
      {planning && <p>Blue interval: from {degrees(l.startAngle)}°, at {degrees(l.rateLimit)}°/s for {l.responseTime} s. Separate planning only; does not drive the aircraft.</p>}
      {uncertainty && <p>Band: ±{(l.gainUncertainty * 100).toFixed(0)}% effectiveness. Conservative capacity ±{a.guaranteedMoment.toFixed(0)} N·m. The force boundary includes uncertainty even with the band hidden.</p>}
      {!pointVisible && <p>Selected estimate is outside the model range or plot window.</p>}{(Math.abs(required) > scale || a.possibleMoment > scale) && <p>Moment values exceed the selected scale.</p>}<p>Net moment adds {competing!.toFixed(0)} N·m competing moment. Dashed segments are excluded; no curve beyond the declared angular validity range.</p></div></div></section>
}
