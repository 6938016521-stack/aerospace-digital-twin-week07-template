import { expect, it } from 'vitest'
import { evaluateStudentArtifact, instructorWeek07ReferenceArtifact as ref, week07BaselineInputs, createWeek07EngineeringRecord, reviseWeek07Record, runWeek07Model, loadWeek07Draft, verifyStudentArtifact } from '../../src/student/lab'
import { createWeek07Store } from '../../src/app/week07-store'
import { reviewSubmission } from '../../scripts/student/review'
it.each([null, {}, {slots:[null]}, {id:4,slots:{}}, {...ref,slots:[{id:'controls.demand',expressions:{}}]}])('rejects malformed artifact without execution: %j', value=>{
 const r=evaluateStudentArtifact(value as unknown as typeof ref,week07BaselineInputs());expect(r['controls.demand'].valid).toBe(false)
})
it.each(['constructor','toString','pitchInertia / 0','1e999 * competingMoment','-'.repeat(600)+'competingMoment'])('rejects unsafe or invalid expression %s',expression=>{
 const artifact={...ref,slots:ref.slots.map(slot=>slot.id==='controls.demand'?{...slot,expressions:[{name:'requiredMoment',expression,unit:'N*m' as const}]}:slot)}
 expect(evaluateStudentArtifact(artifact,week07BaselineInputs())['controls.demand'].valid).toBe(false)
})
it('binds immutable run evidence to exact model and prediction',()=>{
 const record=createWeek07EngineeringRecord('record','1',{moduleId:'controls',modelId:ref.id,version:ref.version},{},JSON.stringify(ref))
 expect(()=>runWeek07Model('a',record,ref,week07BaselineInputs())).toThrow(/Complete|completed/)
 const ready=reviseWeek07Record(record,'2',{physics:'sign',assumptions:'planar',model:'equations',prediction:'quarter'})
 const run=runWeek07Model('b',ready,ref,week07BaselineInputs())
 expect(Object.isFrozen(run.record.fields.prediction)).toBe(true)
 expect(run.prediction).toBe('quarter')
 expect(()=>runWeek07Model('c',ready,{...ref,version:'different'},week07BaselineInputs())).toThrow(/does not match/)
 expect(loadWeek07Draft({getItem:()=>'{broken',setItem:()=>{}},'x').error).toMatch(/Could not load/)
})
it('student moments feed canonical response; blank model has no fallback',()=>{
 const actual=createWeek07Store(ref).getSnapshot().state
 expect(actual.loads.pitchMoment).toMatchObject({status:'known'})
 if(actual.loads.pitchMoment.status==='known')expect(actual.loads.pitchMoment.value).toBeCloseTo(892.0057602762654)
 expect(actual.outputs.controls?.effectiveTailForce).toMatchObject({status:'known'})
 expect(createWeek07Store().getSnapshot().state.loads.pitchMoment.status).toBe('unconfigured')
})
it('separates computational checks from evidence completeness',()=>{
 expect(verifyStudentArtifact(ref).passed).toBe(true)
 const report=reviewSubmission({model:ref,record:{fields:{},modelText:JSON.stringify(ref)},runs:[]})
 expect(report.status).toBe('needs-review');expect(report.errors).toContain('No recorded model execution.')
 expect(report.cases[0]?.firstDivergence).toBeNull()
 expect(report.cases[0]?.pitchHistory.student).toEqual(report.cases[0]?.pitchHistory.reference)
})
