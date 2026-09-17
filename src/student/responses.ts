import type { EngineeringRecordFieldId } from '../platform/lessons/engineering-steps'
import type { Week07ModelRun, Week07Verification } from './lab'

export const WEEK07_SUPPLIED_SETUP = {
  question: 'Calculate required control moment, elevator moment, and the change with airspeed. Explain whether the nominal response meets +0.12 rad/s².',
  system: 'Illustrative planar pitch model. Aircraft geometry, integration, force conversion and constraints are supplied.',
  representation: 'Body axes forward/right/down. Positive pitch moment nose-up. Positive Fz downward. Positive elevator trailing edge down. Reference/CG X=0 m; tail X=-3 m.',
  inputs: 'Iy=5000 kg·m²; target=+0.12 rad/s²; competing=-750 N-m; density=1.225 kg/m³; V=40 m/s; S=16 m²; chord=1.5 m; Cmδ=-0.8/rad; elevator=-5°. Inputs are illustrative, not calibrated.',
} as const

export const WEEK07_FIELD_PROMPTS: Readonly<Partial<Record<EngineeringRecordFieldId, string>>> = {
  physics: 'Explain why a downward force aft of the CG gives a positive nose-up moment.',
  assumptions: 'Explain one supplied assumption and what could invalidate it: planar motion, fixed reference, local linear effectiveness, no trim or damping.',
  model: 'Write your demand, dynamic-pressure, coefficient and moment equations. Identify which quantities are supplied and which are unknown.',
  prediction: 'Before running your own implementation, predict the sign of its elevator moment and the effect of halving airspeed. Explain the competing moment.',
  verification: 'Show one independent hand calculation with units. Compare it with your model, and explain a sign, unit, or limiting-case check.',
  claim: 'What do your computed results support at the stated condition? Include a limitation.',
  reflection: 'What additional evidence or missing physics would you investigate next?',
  aiUse: 'Identify the AI tool and how you used it, what you changed, and how you independently checked the result. State “No AI used” if applicable.',
}

type SubmissionField = { readonly text?: unknown; readonly suppliedBy?: unknown }
type Submission = {
  readonly schemaVersion?: unknown
  readonly readiness?: { readonly ready?: unknown; readonly missing?: unknown } | null
  readonly record?: { readonly id?: unknown; readonly revision?: unknown; readonly modelHash?: unknown; readonly modelText?: unknown; readonly fields?: Record<string, SubmissionField> } | null
  readonly model?: unknown
  readonly runs?: readonly Week07ModelRun[] | unknown
  readonly verification?: Week07Verification | null | unknown
}

const studentFields = ['physics', 'assumptions', 'model', 'prediction', 'verification', 'claim', 'reflection', 'aiUse'] as const
const codeFence = (text: string) => `${'`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)))}\n${text}\n${'`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)))}`
const answer = (value: unknown) => typeof value === 'string' && value.trim() ? codeFence(value) : '_Missing — no response supplied._'
const text = (value: unknown, fallback = '_Missing — no response supplied._') => typeof value === 'string' && value.trim() ? value : fallback
const runSummary = (run: Week07ModelRun, index: number) => {
  const demand = run?.result?.['controls.demand']
  const effect = run?.result?.['controls.effectiveness']
  const errors = [...(demand?.errors ?? []), ...(effect?.errors ?? [])]
  const values = [...Object.entries(demand?.values ?? {}), ...Object.entries(effect?.values ?? {})]
    .map(([name, value]) => `${name}=${value.value} ${value.unit}`)
  return [`### Run ${index + 1}`, `- Recorded: ${text(run?.createdAt, '_Missing timestamp_')}`, `- Run ID: ${text(run?.id, '_Missing run ID_')}`, `- Record revision: ${text(run?.record?.revision, '_Missing revision_')}`, `- Model hash recorded with run: ${text(run?.record?.modelHash, '_Missing model hash_')}`, `- Prediction recorded with run: ${answer(run?.prediction)}`, `- Result status: ${errors.length ? `recorded with errors — ${errors.join(' ')}` : 'recorded values shown below'}`, values.length ? `- Values: ${values.join('; ')}` : '- Values: _Missing — no computed values recorded._'].join('\n')
}

/** Pure, deterministic rendering of the evidence already present in a submission. It never recalculates student work. */
export function renderWeek07Responses(input: unknown): string {
  const submission: Submission = input && typeof input === 'object' ? input as Submission : {}
  const record = submission.record ?? {}
  const fields = record.fields ?? {}
  const runs = Array.isArray(submission.runs) ? submission.runs : []
  const verification = submission.verification && typeof submission.verification === 'object' ? submission.verification as Week07Verification : null
  const readiness = submission.readiness
  const supplied = Object.entries(WEEK07_SUPPLIED_SETUP).map(([id, value]) => `### ${id} — instructor supplied\n${value}`).join('\n\n')
  const responses = studentFields.map(id => `### ${id === 'aiUse' ? 'AI use' : id}\n**Prompt:** ${WEEK07_FIELD_PROMPTS[id]}\n\n**Student response:**\n${answer(fields[id]?.text)}`).join('\n\n')
  const currentVerification = verification?.modelHash === record.modelHash
  const verificationStatus = !verification ? 'No verification record was supplied.' : !currentVerification ? `Stale verification record: it applies to ${text(verification.modelHash, '_Missing model hash_')}, while the submitted model is ${text(record.modelHash, '_Missing model hash_')}.` : verification.passed ? 'Recorded as passed for the submitted model hash.' : 'Recorded as not passed for the submitted model hash.'
  const readinessText = readiness?.ready === true ? 'Marked ready by the submission.' : `Marked incomplete or not ready${Array.isArray(readiness?.missing) ? `; missing: ${readiness.missing.join(', ') || 'unspecified'}` : '.'}`
  return [
    '# Week 07 Controls Lab — Responses',
    'Answers and recorded model results from `submission.json`. This document does not recompute or independently validate the results.',
    '## Submission status',
    `- Schema: ${text(submission.schemaVersion, '_Missing schema version_')}`,
    `- Record ID: ${text(record.id, '_Missing record ID_')}`,
    `- Record revision: ${text(record.revision, '_Missing revision_')}`,
    `- Model hash: ${text(record.modelHash, '_Missing model hash_')}`,
    `- Readiness: ${readinessText}`,
    '## Supplied setup (instructor supplied)', supplied,
    '## Student responses', responses,
    '## Equations and model source',
    'The recorded model JSON/expression source follows exactly as supplied. It is not interpreted or recomputed here.',
    codeFence(typeof record.modelText === 'string' && record.modelText ? record.modelText : JSON.stringify(submission.model, null, 2) ?? '_Missing — no model source supplied._'),
    '## Recorded verification status',
    verificationStatus,
    verification ? `- Checked at: ${text(verification.checkedAt, '_Missing timestamp_')}\n- Detail: ${text(verification.detail, '_Missing verification detail_')}` : '',
    '## Recorded model runs',
    runs.length ? runs.map(runSummary).join('\n\n') : '_Missing — no model runs supplied._',
    '## Submission instructions',
    'Use Save to GitHub in the app to save both files, commit, and push. Submit your fork URL and the saved commit SHA. Manual fallback: save this file beside `student/submission.json`, run `npm run student:prepare` and `npm run student:validate`, then commit and push student/.',
  ].filter(Boolean).join('\n\n') + '\n'
}
