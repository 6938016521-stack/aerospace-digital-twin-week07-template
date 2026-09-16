import type { AircraftState } from '../../src/platform/state/types'
import { stepPitch } from '../../src/platform/simulation/pitch'
import { elevatorScenario } from '../../src/modules/controls/elevator-scenario'
import { createHash } from 'node:crypto'
import { evaluateStudentArtifact, verifyStudentArtifact, instructorWeek07ReferenceArtifact, WEEK07_INPUTS, type Week07Inputs, type StudentLabArtifact, type Week07ModelRun } from '../../src/student/lab'
import { quantity } from '../../src/platform/units/types'
import { ENGINEERING_STEPS } from '../../src/platform/lessons/engineering-steps'

export function caseInputs(speed = 40, target = 0.12, angle = -5): Week07Inputs {
  const values = { pitchInertia: 5000, requestedAcceleration: target, competingMoment: -750, density: 1.225, airspeed: speed, referenceArea: 16, referenceChord: 1.5, elevatorDerivative: -0.8, elevatorAngle: angle * Math.PI / 180 }
  return Object.fromEntries(Object.entries(WEEK07_INPUTS).map(([name, unit]) => [name, quantity(values[name as keyof typeof values], unit, 'week07:comparison')])) as Week07Inputs
}
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
export function reviewSubmission(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Submission must be an object.')
  const submission = input as {model?: StudentLabArtifact; record?: {fields?: Record<string,{text?: string}>; modelText?: string}; runs?: unknown[]}
  if (!submission.model || !submission.record?.fields || !Array.isArray(submission.runs)) throw new Error('Submission requires model, record and runs.')
  const missing = [...ENGINEERING_STEPS, 'aiUse'].filter(k => k !== 'execution' && !submission.record!.fields![k]?.text?.trim())
  const errors: string[] = missing.map(k => `Missing record field: ${k}`)
  if (!submission.runs.length) errors.push('No recorded model execution.')
  try { if (JSON.stringify(JSON.parse(submission.record.modelText ?? '')) !== JSON.stringify(submission.model)) errors.push('Record model text differs from submitted artifact.') } catch { errors.push('Record model text is not valid JSON.') }
  let currentRun = false
  for (const candidate of submission.runs) {
    const run = candidate as Week07ModelRun
    if (!run?.id || !run.record?.fields?.prediction || !run.inputs || !run.artifact || typeof run.prediction !== 'string' || run.prediction !== run.record.fields.prediction.text || !run.prediction.trim()) { errors.push('Malformed or unbound run evidence.'); continue }
    try {
      if(JSON.stringify(JSON.parse(run.record.modelText))!==JSON.stringify(run.artifact)) {errors.push('Run artifact differs from its recorded source.');continue}
      const recomputed=evaluateStudentArtifact(run.artifact,run.inputs)
      if(JSON.stringify(recomputed)!==JSON.stringify(run.result))errors.push('Stored run result differs from trusted recomputation.')
      if(JSON.stringify(run.artifact)===JSON.stringify(submission.model)&&run.prediction===submission.record.fields.prediction?.text)currentRun=true
    }catch{errors.push('Run could not be independently evaluated.')}
  }
  if(!currentRun)errors.push('No run bound to the current model and prediction.')
  const verification = verifyStudentArtifact(submission.model)
  if (!verification.passed) errors.push(verification.detail)
  const cases = [{id:'baseline',speed:40,target:.12,angle:-5},{id:'zero-target',speed:40,target:0,angle:-5},{id:'half-speed',speed:20,target:.12,angle:-5},{id:'zero-elevator',speed:40,target:.12,angle:0}].map(c => {
    const inputs = caseInputs(c.speed,c.target,c.angle)
    const actual = evaluateStudentArtifact(submission.model!,inputs), reference=evaluateStudentArtifact(instructorWeek07ReferenceArtifact,inputs)
    const sequence = [['controls.demand','requiredMoment'],['controls.effectiveness','dynamicPressure'],['controls.effectiveness','deltaCm'],['controls.effectiveness','deltaMoment']] as const
    const firstDivergence = sequence.find(([slot,key]) => {
      const a=actual[slot].values[key], r=reference[slot].values[key]
      return !actual[slot].valid || !a || !r || Math.abs(a.value-r.value)>Math.max(1e-8,Math.abs(r.value)*1e-8)
    })
    if (firstDivergence) errors.push(`${c.id}: first observable divergence ${firstDivergence.join('.')}`)
    const history = (result: typeof actual) => {
      if (!result['controls.effectiveness'].valid) return []
      const value = result['controls.effectiveness'].values.deltaMoment?.value
      if (value === undefined) return []
      let state: AircraftState = {...elevatorScenario.baseline, loads:{...elevatorScenario.baseline.loads,pitchMoment:quantity(value-750,'N*m','week07:history')}, provenance:{...elevatorScenario.baseline.provenance,'week07:history':{id:'week07:history',source:'computed' as const,description:'Comparison moment at fixed reference equal to CG, minus supplied competing moment.',derivedFrom:[]}}}
      const points = [{time:0,pitch:0}]
      for(let i=0;i<50;i++){try{state=stepPitch(state,`comparison-${i}`);const t=state.simulation.elapsedTime,p=state.motion.pitch;if(t.status==='known'&&p.status==='known')points.push({time:t.value,pitch:p.value})}catch{break}}
      return points
    }
    return {id:c.id,inputs,actual,reference,firstDivergence:firstDivergence?.join('.')??null,pitchHistory:{student:history(actual),reference:history(reference),description:'Identical supplied 0.02 s constant-moment integration, up to 1 s or 30-degree display guard. Not a flight trajectory.'}}

  })
  return {status:errors.length?'needs-review':'checks-passed',errors,verification,cases,claimBoundary:'Computational checks are not grading, aircraft validation, or proof of authorship.'}
}
