import { ENGINEERING_STEPS, quantity } from '../platform'
import type { CanonicalUnit, EngineeringValue, ModelReference } from '../platform'
import type { EngineeringRecordFieldId } from '../platform/lessons/engineering-steps'

/** The two replaceable Week 07 calculations.  The artifact deliberately contains
 * text equations instead of executable JavaScript. */
export const WEEK07_SLOT_IDS = ['controls.demand', 'controls.effectiveness'] as const
export type Week07SlotId = (typeof WEEK07_SLOT_IDS)[number]
export interface StudentExpression { readonly name: string; readonly expression: string; readonly unit: CanonicalUnit }
export interface StudentModelSlot { readonly id: Week07SlotId; readonly expressions: readonly StudentExpression[] }
export interface StudentLabArtifact { readonly schemaVersion: 'week07.student-model/v1'; readonly id: string; readonly version: string; readonly slots: readonly StudentModelSlot[] }

export interface StudentEvaluation {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly values: Readonly<Record<string, { readonly value: number; readonly unit: CanonicalUnit }>>
}

type Dimension = readonly [number, number, number] // mass, length, time; radians are dimensionless in physics.
type UnitSpec = { readonly dim: Dimension }
const D = (m: number, l: number, t: number): UnitSpec => ({ dim: [m, l, t] })
const UNIT: Readonly<Record<CanonicalUnit, UnitSpec>> = {
  '1': D(0, 0, 0), m: D(0, 1, 0), 'm^2': D(0, 2, 0), kg: D(1, 0, 0), 'kg*m^2': D(1, 2, 0), s: D(0, 0, 1),
  rad: D(0, 0, 0), 'rad/s': D(0, 0, -1), 'rad/s^2': D(0, 0, -2), 'm/s': D(0, 1, -1), 'm/s^2': D(0, 1, -2),
  'kg/m^3': D(1, -3, 0), N: D(1, 1, -2), 'N*m': D(1, 2, -2), Pa: D(1, -1, -2), K: D(0, 0, 0), '1/rad': D(0, 0, 0),
}
const same = (a: UnitSpec, b: UnitSpec) => a.dim.every((v, i) => v === b.dim[i])
const multiply = (a: UnitSpec, b: UnitSpec): UnitSpec => D(a.dim[0] + b.dim[0], a.dim[1] + b.dim[1], a.dim[2] + b.dim[2])
const divide = (a: UnitSpec, b: UnitSpec): UnitSpec => D(a.dim[0] - b.dim[0], a.dim[1] - b.dim[1], a.dim[2] - b.dim[2])

export const WEEK07_INPUTS = {
  pitchInertia: 'kg*m^2', requestedAcceleration: 'rad/s^2', competingMoment: 'N*m',
  density: 'kg/m^3', airspeed: 'm/s', referenceArea: 'm^2', referenceChord: 'm',
  elevatorDerivative: '1/rad', elevatorAngle: 'rad',
} as const satisfies Readonly<Record<string, CanonicalUnit>>
export type Week07InputName = keyof typeof WEEK07_INPUTS
export type Week07Inputs = Readonly<Partial<{ [K in Week07InputName]: EngineeringValue<(typeof WEEK07_INPUTS)[K]> }>>
const SLOT_OUTPUTS: Readonly<Record<Week07SlotId, Readonly<Record<string, CanonicalUnit>>>> = {
  'controls.demand': { requiredMoment: 'N*m' },
  'controls.effectiveness': { dynamicPressure: 'Pa', deltaCm: '1', deltaMoment: 'N*m' },
}

type Token = { readonly kind: 'number' | 'name' | 'operator' | 'open' | 'close' | 'end'; readonly text: string }
type Node = { readonly kind: 'number'; readonly value: number } | { readonly kind: 'name'; readonly value: string } | { readonly kind: 'unary'; readonly op: '+' | '-'; readonly right: Node } | { readonly kind: 'binary'; readonly op: '+' | '-' | '*' | '/'; readonly left: Node; readonly right: Node }
const MAX_EXPRESSION_LENGTH = 512
const MAX_EXPRESSIONS = 48
function tokens(text: string): Token[] {
  if (!text.trim() || text.length > MAX_EXPRESSION_LENGTH) throw new Error('Expression is empty or exceeds the 512 character limit.')
  const out: Token[] = []; let index = 0
  while (index < text.length) {
    const rest = text.slice(index); const space = /^\s+/.exec(rest); if (space) { index += space[0].length; continue }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)
    if (number) { out.push({ kind: 'number', text: number[0] }); index += number[0].length; continue }
    const name = /^[A-Za-z][A-Za-z0-9_]*/.exec(rest)
    if (name) { out.push({ kind: 'name', text: name[0] }); index += name[0].length; continue }
    const char = rest[0]!; if ('+-*/'.includes(char)) out.push({ kind: 'operator', text: char }); else if (char === '(') out.push({ kind: 'open', text: char }); else if (char === ')') out.push({ kind: 'close', text: char }); else throw new Error(`Unsupported character ${JSON.stringify(char)}.`)
    index++
  }
  out.push({ kind: 'end', text: '' }); return out
}
function parse(text: string): Node {
  const all = tokens(text); let at = 0
  const take = () => all[at++]!
  function primary(): Node { const token = take(); if (token.kind === 'number') return { kind: 'number', value: Number(token.text) }; if (token.kind === 'name') return { kind: 'name', value: token.text }; if (token.kind === 'operator' && (token.text === '+' || token.text === '-')) return { kind: 'unary', op: token.text, right: primary() }; if (token.kind === 'open') { const value = expression(); if (take().kind !== 'close') throw new Error('Expected closing parenthesis.'); return value } throw new Error('Expected a number, approved variable, or parenthesized expression.') }
  function product(): Node { let left = primary(); while (all[at]!.kind === 'operator' && (all[at]!.text === '*' || all[at]!.text === '/')) { const op = take().text as '*' | '/'; left = { kind: 'binary', op, left, right: primary() } } return left }
  function expression(): Node { let left = product(); while (all[at]!.kind === 'operator' && (all[at]!.text === '+' || all[at]!.text === '-')) { const op = take().text as '+' | '-'; left = { kind: 'binary', op, left, right: product() } } return left }
  const result = expression(); if (all[at]!.kind !== 'end') throw new Error('Unexpected expression suffix.'); return result
}
function evaluateWithResolver(node: Node, resolve: (name: string) => { value: number; unit: UnitSpec }): { value: number; unit: UnitSpec } {
  if (node.kind === 'number') return { value: node.value, unit: UNIT['1'] }
  if (node.kind === 'name') return resolve(node.value)
  if (node.kind === 'unary') { const right = evaluateWithResolver(node.right, resolve); return { value: node.op === '-' ? -right.value : right.value, unit: right.unit } }
  const left = evaluateWithResolver(node.left, resolve), right = evaluateWithResolver(node.right, resolve)
  if (node.op === '+' || node.op === '-') { if (!same(left.unit, right.unit)) throw new Error('Addition and subtraction require matching dimensions.'); return { value: node.op === '+' ? left.value + right.value : left.value - right.value, unit: left.unit } }
  if (node.op === '/') { if (right.value === 0) throw new Error('Division by zero.'); return { value: left.value / right.value, unit: divide(left.unit, right.unit) } }
  return { value: left.value * right.value, unit: multiply(left.unit, right.unit) }
}

function freezeEvaluation(valid: boolean, errors: string[], values: Record<string, { value: number; unit: CanonicalUnit }>): StudentEvaluation { return Object.freeze({ valid, errors: Object.freeze(errors), values: Object.freeze(values) }) }
/** Validates and evaluates every slot independently.  Invalid artifacts never execute JavaScript. */
export function evaluateStudentArtifact(artifact: StudentLabArtifact, inputs: Week07Inputs): Readonly<Record<Week07SlotId, StudentEvaluation>> {
  const result: Record<Week07SlotId, StudentEvaluation> = {} as Record<Week07SlotId, StudentEvaluation>
  const unsafeArtifact = artifact as unknown as { id?: unknown; version?: unknown; schemaVersion?: unknown; slots?: unknown }
  const safeSlots = Array.isArray(unsafeArtifact?.slots) ? unsafeArtifact.slots.filter((slot): slot is StudentModelSlot => Boolean(slot) && typeof slot === 'object' && typeof (slot as { id?: unknown }).id === 'string' && Array.isArray((slot as { expressions?: unknown }).expressions)) : []
  const ids = safeSlots.map((slot) => slot.id)
  for (const slotId of WEEK07_SLOT_IDS) {
    const errors: string[] = []; const values: Record<string, { value: number; unit: CanonicalUnit }> = {}
    const slot = safeSlots.find((candidate) => candidate.id === slotId)
    if (typeof unsafeArtifact?.id !== 'string' || !unsafeArtifact.id.trim() || typeof unsafeArtifact.version !== 'string' || !unsafeArtifact.version.trim()) errors.push('Artifact id and version are required.')
    if (unsafeArtifact?.schemaVersion !== 'week07.student-model/v1') errors.push('Unsupported or missing Week 07 artifact schema version.')
    if (ids.filter((id) => id === slotId).length !== 1) errors.push(`Exactly one ${slotId} slot is required.`)
    if (!slot || !Array.isArray(slot.expressions) || slot.expressions.length === 0 || slot.expressions.length > MAX_EXPRESSIONS) errors.push(`${slotId} requires 1–${MAX_EXPRESSIONS} expressions.`)
    const names: Record<string, { value: number; unit: UnitSpec }> = Object.create(null) as Record<string, { value: number; unit: UnitSpec }>
    for (const [name, unit] of Object.entries(WEEK07_INPUTS)) { const input = inputs[name as Week07InputName]; if (input?.status === 'known') { if (input.unit !== unit || !Number.isFinite(input.value)) errors.push(`Input ${name} must be finite ${unit}.`); else names[name] = { value: input.value, unit: UNIT[unit] } } }
    const declared = new Map<string, { readonly expression: StudentExpression; readonly node: Node }>()
    for (const unsafeExpression of slot?.expressions ?? []) {
      const expression = unsafeExpression as StudentExpression
      if (!expression || typeof expression !== 'object' || typeof expression.name !== 'string' || typeof expression.expression !== 'string' || typeof expression.unit !== 'string') { errors.push('Each expression must contain string name, expression, and unit fields.'); continue }
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(expression.name) || Object.hasOwn(WEEK07_INPUTS, expression.name)) { errors.push(`Invalid or reserved expression name ${expression.name}.`); continue }
      if (declared.has(expression.name)) { errors.push(`Duplicate expression name ${expression.name}.`); continue }
      if (!Object.hasOwn(UNIT, expression.unit)) { errors.push(`Unknown unit for ${expression.name}.`); continue }
      try { declared.set(expression.name, { expression, node: parse(expression.expression) }) } catch (error) { errors.push(`${expression.name}: ${error instanceof Error ? error.message : String(error)}`) }
    }
    const evaluating = new Set<string>()
    const resolve = (name: string): { value: number; unit: UnitSpec } => {
      const present = Object.hasOwn(names, name) ? names[name] : undefined; if (present) return present
      const declaration = declared.get(name); if (!declaration) throw new Error(`Unknown variable ${name}.`)
      if (evaluating.has(name)) throw new Error(`Dependency cycle involving ${name}.`)
      evaluating.add(name)
      const value = evaluateWithResolver(declaration.node, resolve)
      evaluating.delete(name)
      if (!Number.isFinite(value.value)) throw new Error('Result is not finite.')
      if (!same(value.unit, UNIT[declaration.expression.unit])) throw new Error(`Declared unit ${declaration.expression.unit} does not match the expression dimensions.`)
      const normalized = Object.is(value.value, -0) ? 0 : value.value
      const settled = { value: normalized, unit: value.unit }
      names[name] = settled; values[name] = { value: normalized, unit: declaration.expression.unit }
      return settled
    }
    for (const name of declared.keys()) try { resolve(name) } catch (error) { errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`) }
    for (const [name, unit] of Object.entries(SLOT_OUTPUTS[slotId])) { const value = values[name]; if (!value) errors.push(`Required output ${name} is missing.`); else if (value.unit !== unit) errors.push(`Output ${name} must declare canonical unit ${unit}.`) }
    result[slotId] = freezeEvaluation(errors.length === 0, errors, values)
  }
  return Object.freeze(result)
}
export function validateStudentArtifact(artifact: StudentLabArtifact): Readonly<Record<Week07SlotId, readonly string[]>> { const sample = Object.fromEntries(Object.entries(WEEK07_INPUTS).map(([name, unit]) => [name, quantity(1, unit, 'student:validation-input')])) as Week07Inputs; const checked = evaluateStudentArtifact(artifact, sample); return Object.freeze(Object.fromEntries(WEEK07_SLOT_IDS.map((id) => [id, checked[id].errors]))) as Readonly<Record<Week07SlotId, readonly string[]>> }
export function week07BaselineInputs(overrides: Partial<Record<Week07InputName, number>> = {}): Week07Inputs {
  const values: Record<Week07InputName, number> = { pitchInertia: 5000, requestedAcceleration: 0.12, competingMoment: -750, density: 1.225, airspeed: 40, referenceArea: 16, referenceChord: 1.5, elevatorDerivative: -0.8, elevatorAngle: -Math.PI / 36, ...overrides }
  return Object.freeze(Object.fromEntries(Object.entries(WEEK07_INPUTS).map(([name, unit]) => [name, quantity(values[name as Week07InputName], unit, `student:baseline:${name}`)])) as Week07Inputs)
}
export function verifyStudentArtifact(artifact: StudentLabArtifact): { readonly passed: boolean; readonly detail: string } {
  const baseline = evaluateStudentArtifact(artifact, week07BaselineInputs())
  const zero = evaluateStudentArtifact(artifact, week07BaselineInputs({ requestedAcceleration: 0 }))
  const quarter = evaluateStudentArtifact(artifact, week07BaselineInputs({ airspeed: 20 }))
  const neutral = evaluateStudentArtifact(artifact, week07BaselineInputs({ elevatorAngle: 0 }))
  const values = (checked: Readonly<Record<Week07SlotId, StudentEvaluation>>, slot: Week07SlotId, name: string) => checked[slot].values[name]?.value
  const errors = [baseline, zero, quarter, neutral].flatMap((checked) => WEEK07_SLOT_IDS.flatMap((id) => checked[id].errors))
  const checks = [
    Math.abs((values(baseline, 'controls.effectiveness', 'dynamicPressure') ?? NaN) - 980) < 1e-8,
    Math.abs((values(quarter, 'controls.effectiveness', 'dynamicPressure') ?? NaN) - 245) < 1e-8,
    Math.abs((values(baseline, 'controls.effectiveness', 'deltaCm') ?? NaN) - Math.PI / 45) < 1e-8,
    (values(neutral, 'controls.effectiveness', 'deltaCm') ?? NaN) === 0,
    Math.abs((values(baseline, 'controls.demand', 'requiredMoment') ?? NaN) - 1350) < 1e-8,
    Math.abs((values(zero, 'controls.demand', 'requiredMoment') ?? NaN) - 750) < 1e-8,
    Math.abs((values(baseline, 'controls.effectiveness', 'deltaMoment') ?? NaN) - 1642.0057602762654) < 1e-8,
    Math.abs((values(quarter, 'controls.effectiveness', 'deltaMoment') ?? NaN) - 1642.0057602762654 / 4) < 1e-8,
    (values(neutral, 'controls.effectiveness', 'deltaMoment') ?? NaN) === 0,
  ]
  const passed = errors.length === 0 && checks.every(Boolean)
  return Object.freeze({ passed, detail: passed ? 'Student artifact passed demand, baseline elevator, quadratic speed, and neutral-deflection checks.' : errors.length ? errors.join(' ') : 'Student expressions did not match the Week 07 verification cases.' })
}

export const defaultBlankWeek07Artifact: StudentLabArtifact = Object.freeze({ schemaVersion: 'week07.student-model/v1', id: 'week07-student-model', version: '1.0.0', slots: Object.freeze(WEEK07_SLOT_IDS.map((id) => Object.freeze({ id, expressions: Object.freeze([]) }))) })
export const instructorWeek07ReferenceArtifact: StudentLabArtifact = Object.freeze({ schemaVersion: 'week07.student-model/v1', id: 'week07-instructor-reference', version: '1.0.0', slots: Object.freeze([
  Object.freeze({ id: 'controls.demand', expressions: Object.freeze([{ name: 'requiredMoment', expression: 'pitchInertia * requestedAcceleration - competingMoment', unit: 'N*m' as const }]) }),
  Object.freeze({ id: 'controls.effectiveness', expressions: Object.freeze([
    { name: 'dynamicPressure', expression: '0.5 * density * airspeed * airspeed', unit: 'Pa' as const }, { name: 'deltaCm', expression: 'elevatorDerivative * elevatorAngle', unit: '1' as const }, { name: 'deltaMoment', expression: 'dynamicPressure * referenceArea * referenceChord * deltaCm', unit: 'N*m' as const },
  ]) }),
]) })

export type Week07RecordField = { readonly suppliedBy: 'instructor' | 'student' | 'automatic'; readonly locked: boolean; readonly text: string }
export interface Week07EngineeringRecord { readonly id: string; readonly revision: string; readonly model: ModelReference; readonly modelText: string; readonly modelHash: string; readonly fields: Readonly<Record<EngineeringRecordFieldId, Week07RecordField>> }
const LOCKED = new Set<EngineeringRecordFieldId>(['question', 'system', 'representation', 'inputs'])
function stableHash(text: string): string { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}` }
function snapshot<T>(value: T): T {
  const cloned = structuredClone(value)
  const seen = new WeakSet<object>()
  const freeze = (candidate: unknown): unknown => {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) return candidate
    seen.add(candidate)
    for (const child of Object.values(candidate)) freeze(child)
    return Object.freeze(candidate)
  }
  return freeze(cloned) as T
}
export function createWeek07EngineeringRecord(id: string, revision: string, model: ModelReference, supplied: Partial<Record<'question' | 'system' | 'representation' | 'inputs', string>> = {}, modelText = ''): Week07EngineeringRecord {
  const fields = Object.fromEntries(([...ENGINEERING_STEPS, 'aiUse'] as EngineeringRecordFieldId[]).map((name) => [name, Object.freeze({ suppliedBy: LOCKED.has(name) ? 'instructor' : name === 'execution' ? 'automatic' : 'student', locked: LOCKED.has(name), text: LOCKED.has(name) ? supplied[name as keyof typeof supplied] ?? '' : '' })])) as Record<EngineeringRecordFieldId, Week07RecordField>
  return snapshot({ id, revision, model, modelText, modelHash: stableHash(modelText), fields })
}
export function reviseWeek07Record(record: Week07EngineeringRecord, revision: string, changes: Partial<Record<EngineeringRecordFieldId, string>>, modelText = record.modelText): Week07EngineeringRecord { const fields = { ...record.fields }; for (const [name, text] of Object.entries(changes) as [EngineeringRecordFieldId, string][]) { if (fields[name].locked || name === 'execution') throw new Error(`${name} is locked or automatically produced.`); fields[name] = { ...fields[name], text } } return snapshot({ ...record, revision, modelText, modelHash: stableHash(modelText), fields }) }
export function canRunWeek07Model(record: Week07EngineeringRecord): boolean { return ['physics', 'assumptions', 'model', 'prediction'].every((name) => record.fields[name as EngineeringRecordFieldId].text.trim().length > 0) }
/** Submission readiness is intentionally stricter than permission to run a model. */
export function week07RecordReadiness(record: Week07EngineeringRecord, runs: readonly Week07ModelRun[] = []): { readonly ready: boolean; readonly missing: readonly EngineeringRecordFieldId[] } {
  const studentRequired: EngineeringRecordFieldId[] = ['physics', 'assumptions', 'model', 'prediction', 'verification', 'claim', 'reflection', 'aiUse']
  const missing = studentRequired.filter((field) => !record.fields[field].text.trim())
  if (!runs.some((run) => run.record.modelHash === record.modelHash && run.prediction === record.fields.prediction.text)) missing.push('execution')
  return Object.freeze({ ready: missing.length === 0, missing: Object.freeze(missing) })
}
export interface Week07ModelRun { readonly id: string; readonly createdAt: string; readonly record: Week07EngineeringRecord; readonly prediction: string; readonly artifact: StudentLabArtifact; readonly inputs: Week07Inputs; readonly result: Readonly<Record<Week07SlotId, StudentEvaluation>> }
export function runWeek07Model(id: string, record: Week07EngineeringRecord, artifact: StudentLabArtifact, inputs: Week07Inputs, createdAt = new Date().toISOString()): Week07ModelRun { if (!canRunWeek07Model(record)) throw new Error('Physics, assumptions, model, and prediction must be completed before a model run.'); if (record.modelHash !== stableHash(record.modelText)) throw new Error('Record model text and model hash do not match.'); let fromRecord: unknown; try { fromRecord = JSON.parse(record.modelText) } catch { throw new Error('Record model text is not valid JSON.') } if (JSON.stringify(fromRecord) !== JSON.stringify(artifact)) throw new Error('Run artifact does not match the exact model text recorded for this revision.'); return snapshot({ id, createdAt, record: snapshot(record), prediction: record.fields.prediction.text, artifact: snapshot(artifact), inputs: snapshot(inputs), result: evaluateStudentArtifact(artifact, inputs) }) }
export interface Week07Verification { readonly modelHash: string; readonly checkedAt: string; readonly passed: boolean; readonly detail: string }
export interface Week07Draft { readonly revision: string; readonly record: Week07EngineeringRecord; readonly artifact: StudentLabArtifact; readonly runs: readonly Week07ModelRun[]; readonly verification?: Week07Verification }
export function createWeek07Draft(record: Week07EngineeringRecord, artifact: StudentLabArtifact = defaultBlankWeek07Artifact): Week07Draft { return snapshot({ revision: record.revision, record, artifact, runs: [] }) }
export function exportWeek07Submission(draft: Week07Draft) { return snapshot({ schemaVersion: 'week07.submission/v1', readiness: week07RecordReadiness(draft.record, draft.runs), record: draft.record, model: draft.artifact, runs: draft.runs, verification: draft.verification ?? null }) }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function saveWeek07Draft(storage: StorageLike, key: string, draft: Week07Draft): void { storage.setItem(key, JSON.stringify(draft)) }
export function loadWeek07Draft(storage: StorageLike, key: string): { readonly draft: Week07Draft | null; readonly error: string | null } { const text = storage.getItem(key); if (text === null) return Object.freeze({ draft: null, error: null }); try { const parsed = JSON.parse(text) as Week07Draft; const fields = parsed?.record?.fields as Partial<Record<EngineeringRecordFieldId, Week07RecordField>> | undefined; const requiredFields = [...ENGINEERING_STEPS, 'aiUse'] as EngineeringRecordFieldId[]; const validFields = !!fields && requiredFields.every((field) => { const value = fields[field]; return typeof value?.text === 'string' && (value.suppliedBy === 'instructor' || value.suppliedBy === 'student' || value.suppliedBy === 'automatic') && typeof value.locked === 'boolean' && value.locked === LOCKED.has(field) })
    if (!parsed || typeof parsed !== 'object' || typeof parsed.revision !== 'string' || !parsed.record || typeof parsed.record.id !== 'string' || typeof parsed.record.revision !== 'string' || !parsed.record.model || typeof parsed.record.model.moduleId !== 'string' || typeof parsed.record.model.modelId !== 'string' || typeof parsed.record.model.version !== 'string' || typeof parsed.record.modelText !== 'string' || typeof parsed.record.modelHash !== 'string' || !validFields || !parsed.artifact || typeof parsed.artifact !== 'object' || !Array.isArray(parsed.artifact.slots) || !Array.isArray(parsed.runs)) throw new Error('Saved draft has an invalid shape.'); if (parsed.record.modelHash !== stableHash(parsed.record.modelText)) throw new Error('Saved draft model text hash does not match.'); return Object.freeze({ draft: snapshot(parsed), error: null }) } catch (error) { return Object.freeze({ draft: null, error: `Could not load saved Week 07 draft: ${error instanceof Error ? error.message : String(error)}` }) } }
