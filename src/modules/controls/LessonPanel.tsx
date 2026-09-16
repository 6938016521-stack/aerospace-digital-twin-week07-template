import { useEffect, useRef, useState } from 'react'
import { quantity, radiansToDegrees, type AircraftStore, type CanonicalUnit, type EngineeringValue, type StoreSnapshot } from '../../platform'
import type { LessonDescriptor, LessonStageDescriptor } from '../../platform'
import { QuantityInput } from './QuantityInput'

const known = (value: EngineeringValue<CanonicalUnit> | undefined) => value?.status === 'known' ? value.value : undefined

function reading(label: string, value: EngineeringValue<CanonicalUnit> | undefined, degree = false) {
  const number = known(value)
  return <div className="lesson-reading" key={label}><span>{label}</span><output>{number === undefined ? 'Unavailable' : `${Number((degree ? radiansToDegrees(number) : number).toPrecision(6))} ${degree ? 'deg' : value!.unit}`}</output></div>
}

export function LessonPanel({ store, snapshot, lesson }: { store: AircraftStore; snapshot: StoreSnapshot; lesson: LessonDescriptor }) {
  const [error, setError] = useState('')
  const panel = useRef<HTMLElement>(null)
  const progress = snapshot.lesson!
  const index = lesson.stages.findIndex((stage) => stage.id === progress.stageId)
  const stage = lesson.stages[index]!
  const predicted = progress.prediction !== null
  const revealed = progress.revealed
  const state = snapshot.state
  useEffect(() => {
    const inspector = panel.current?.closest<HTMLElement>('.studio-inspector')
    if (inspector) inspector.scrollTop = 0
  }, [])
  const dispatch = (type: string, payload: unknown) => {
    const result = store.dispatch({ id: crypto.randomUUID(), type, payload, source: 'lesson', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } })
    setError(result.ok ? '' : result.error)
    return result.ok
  }
  const input = (label: string, value: number | undefined, unit: CanonicalUnit, type: string, field?: string, degrees = false) => <QuantityInput key={label} label={label} value={value === undefined ? undefined : degrees ? radiansToDegrees(value) : value} unit={degrees ? 'deg' : unit} apply={(number) => {
    const id = crypto.randomUUID()
    const engineeringValue = quantity(degrees ? number * Math.PI / 180 : number, unit, id)
    const payload = field ? { moduleId: 'controls', field, value: engineeringValue } : { value: engineeringValue }
    const result = store.dispatch({ id, type, payload, source: 'lesson', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } }, { id, source: 'student-entered', description: 'Student experiment in the C5 Week 06 lesson.', derivedFrom: [] })
    return result.ok ? null : result.error
  }} />
  const applyRequiredTailForce = () => {
    const requirement = state.outputs.controls?.requiredForce
    if (!requirement || requirement.status !== 'known' || !Number.isFinite(requirement.value)) {
      setError('A finite required tail force is unavailable.')
      return
    }
    const id = crypto.randomUUID()
    const result = store.dispatch({ id, type: 'SET_MODULE_STATE', payload: { moduleId: 'controls', field: 'tailForce', value: quantity(requirement.value, 'N', id) }, source: 'lesson', context: { scenarioId: snapshot.scenarioId, model: snapshot.activeModels[0] ?? null } }, { id, source: 'student-entered', description: 'Student applied the displayed required tail force in the C5 Week 06 Stage 1 experiment.', derivedFrom: [requirement.provenanceId] })
    setError(result.ok ? '' : result.error)
  }
  const controls = (() => {
    const fields = state.modules.controls
    switch (stage.id) {
      case 'signed-moment': return input('Requested pitch acceleration', known(fields?.requestedAcceleration), 'rad/s^2', 'SET_MODULE_STATE', 'requestedAcceleration')
      case 'elevator-response': return input('Elevator (deg)', known(state.controls.elevatorCommanded), 'rad', 'SET_ELEVATOR', undefined, true)
      case 'airspeed-scaling':
      case 'authority': return input('Airspeed (m/s)', known(state.motion.airspeed), 'm/s', 'SET_AIRSPEED')
      case 'uncertainty': return input('Gain uncertainty (fraction)', known(fields?.gainUncertainty), '1', 'SET_MODULE_STATE', 'gainUncertainty')
      case 'rate-planning': return input('Response time (s)', known(fields?.responseTime), 's', 'SET_MODULE_STATE', 'responseTime')
      default: return null
    }
  })()
  const observations = (() => {
    const output = state.outputs.controls
    switch (stage.id) {
      case 'signed-moment': {
        const requiredForce = known(output?.requiredForce)
        const canApplyRequiredForce = requiredForce !== undefined && Number.isFinite(requiredForce)
        return <><section className="lesson-target-requirement" aria-label="Target requirement"><h3>Target requirement</h3>{reading('Required control moment', output?.requiredMoment)}{reading('Required tail force', output?.requiredForce)}<p>Changing the target updates these required values only.</p></section><section className="lesson-applied-response" aria-label="Applied response"><h3>Applied response</h3>{reading('Applied tail force (aircraft arrows)', state.modules.controls?.tailForce)}{reading('Net pitch moment', state.loads.pitchMoment)}{reading('Achieved acceleration', output?.achievedAcceleration)}<p>The aircraft arrows show the applied values. Apply the required force explicitly; target edits never change it automatically.</p>{revealed && <button disabled={!canApplyRequiredForce} onClick={applyRequiredTailForce}>Apply required tail force</button>}</section></>
      }
      case 'elevator-response':
      case 'airspeed-scaling': return <>{reading('Dynamic pressure', state.loads.dynamicPressure)}{reading('Elevator moment', output?.deltaMoment)}{reading('Selected acceleration', output?.achievedAcceleration)}</>
      case 'authority': return <>{reading('Usable travel', output?.usableAngle, true)}<div className="lesson-reading"><span>Within declared envelope</span><output>{known(output?.withinEnvelope) === undefined ? 'Unavailable' : known(output?.withinEnvelope) === 1 ? 'Yes' : 'No'}</output></div>{reading('Requested acceleration estimate', output?.estimatedAcceleration)}{reading('Equivalent force estimate', output?.estimatedForce)}</>
      case 'uncertainty': return <>{reading('Conservative capacity', output?.guaranteedMoment)}{reading('Required control moment', output?.requiredMoment)}{reading('Weakest-gain target', output?.worstCaseTargetAngle, true)}</>
      case 'rate-planning': return <>{reading('Reachable minimum', output?.reachableMin, true)}{reading('Reachable maximum', output?.reachableMax, true)}{reading('Weakest-gain target', output?.worstCaseTargetAngle, true)}{reading('Rate margin', output?.rateMargin)}</>
      default: return null
    }
  })()
  return <section ref={panel} className="lesson-panel" aria-label="Week 06 lesson">
    <header><p className="eyebrow">WEEK 06 · LESSON</p><p className="lesson-counter">Stage {index + 1} of {lesson.stages.length}</p><h2>{stage.title}</h2></header>
    <div className="lesson-copy"><h3>Instructions</h3>{stage.instructions?.map((line) => <p key={line}>{line}</p>)}</div>
    {stage.id === 'signed-moment' && <SignedMomentWorkedExample collapsed={predicted} />}
    <p className="lesson-session-note">Progress and predictions are kept for this session only. Reloading clears them.</p>
    {!predicted ? <Prediction stage={stage} submit={(text) => dispatch('SUBMIT_PREDICTION', { text })} /> : <><details className="lesson-submitted-prediction"><summary>Your submitted prediction</summary><p>{progress.prediction}</p></details>
      <div className="lesson-experiment"><h3>Experiment</h3>{controls}</div>
      <div className="lesson-observations" aria-label="Observed readings"><h3>Observed readings</h3>{observations}</div>
      {!revealed && <button disabled={progress.experimentCount === 0} onClick={() => dispatch('REVEAL_LESSON', null)}>Reveal explanation</button>}
      {revealed && <div className="lesson-reveal"><h3>Takeaways</h3><ul>{stage.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}</ul><h3>Student task</h3><ul>{stage.studentTasks?.map((task) => <li key={task}>{task}</li>)}</ul><p className="lesson-boundary">Claim boundary: {stage.claimBoundary.join(' ')}</p>{index === lesson.stages.length - 1 && <p role="status">Lesson complete</p>}</div>}
    </>}
    <footer className="lesson-navigation"><button disabled={index === 0} onClick={() => dispatch('GO_TO_LESSON_STAGE', { stageId: lesson.stages[index - 1]!.id })}>Previous stage</button><button onClick={() => dispatch('RESET_SCENARIO', { scenarioId: stage.scenarioId })}>Reset stage</button><button disabled={!revealed || index === lesson.stages.length - 1} onClick={() => dispatch('GO_TO_LESSON_STAGE', { stageId: lesson.stages[index + 1]!.id })}>Next stage</button><button onClick={() => dispatch('EXIT_LESSON', null)}>Exit lesson</button></footer>
    {error && <p role="alert">{error}</p>}
  </section>
}

function SignedMomentWorkedExample({ collapsed }: { collapsed: boolean }) {
  return <article className="lesson-worked-example" aria-label="Worked Stage 1 baseline example">
    {collapsed && <p className="lesson-fixed-reference">Fixed reference example · expand to review</p>}
    <details open={!collapsed}>
      <summary><h3>Fixed reference example: worked baseline</h3></summary>
      <div>
    <p><strong>Sign convention:</strong> positive (+) moments are nose-up; negative (−) moments are nose-down.</p>
    <p><var>I<sub>y</sub></var> is the pitch moment of inertia: how strongly the aircraft resists angular acceleration about its pitch axis. <var>α<sub>target</sub></var> is the desired pitch angular acceleration.</p>
    <p>The control and competing moments must add to the net moment needed for that target:</p>
    <p><var>M<sub>control</sub></var> + <var>M<sub>competing</sub></var> = <var>I<sub>y</sub></var> × <var>α<sub>target</sub></var>.</p>
    <ol>
      <li><strong>Required net moment:</strong> <var>I<sub>y</sub></var> × <var>α<sub>target</sub></var> = 5000 kg·m² × (+0.12 rad/s²) = <strong>+600 N·m</strong> net nose-up.</li>
      <li><strong>Competing moment:</strong> <var>M<sub>competing</sub></var> = <strong>−750 N·m</strong>, a nose-down moment.</li>
      <li><strong>Required control moment:</strong> <var>M<sub>control</sub></var> = +600 N·m − (−750 N·m) = <strong>+1350 N·m</strong> nose-up.</li>
      <li><strong>Check:</strong> +1350 N·m − 750 N·m = +600 N·m net nose-up.</li>
    </ol>
    <p>The control must first cancel the 750 N·m nose-down contribution, then provide another 600 N·m to accelerate nose-up.</p>
    <p>This is a prescribed demand calculation. Changing <var>α<sub>target</sub></var> changes the required moment; it does not automatically change the applied tail force or achieved acceleration.</p>
      </div>
    </details>
  </article>
}

function Prediction({ stage, submit }: { stage: LessonStageDescriptor; submit: (text: string) => boolean }) {
  const [text, setText] = useState('')
  return <form className="lesson-prediction" onSubmit={(event) => { event.preventDefault(); submit(text) }}><h3>Your prediction</h3><p>{stage.prediction?.prompt}</p><label>Prediction<textarea maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a prediction before experimenting." /></label><button disabled={!text.trim()}>Submit prediction</button></form>
}
