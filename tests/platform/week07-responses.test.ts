import { describe, expect, it } from 'vitest'
import { renderWeek07Responses, WEEK07_FIELD_PROMPTS, WEEK07_SUPPLIED_SETUP } from '../../src/student/responses'

const fields = Object.fromEntries(Object.entries(WEEK07_FIELD_PROMPTS).map(([id, prompt]) => [id, { text: `Answer for ${id}: ${prompt}` }]))
const submission = {
  schemaVersion: 'week07.submission/v1',
  readiness: { ready: true, missing: [] },
  record: { id: 'record-1', revision: '2', modelHash: 'fnv1a-current', modelText: '{\n  "expression": "a * b"\n}', fields },
  model: { ignored: 'because modelText is the source' },
  runs: [{
    id: 'run-1', createdAt: '2026-09-17T00:00:00.000Z', prediction: 'Positive elevator moment.',
    record: { revision: '2', modelHash: 'fnv1a-current' },
    result: { 'controls.demand': { errors: [], values: { requiredMoment: { value: 1350, unit: 'N*m' } } }, 'controls.effectiveness': { errors: [], values: { dynamicPressure: { value: 980, unit: 'Pa' } } } },
  }],
  verification: { modelHash: 'fnv1a-current', checkedAt: '2026-09-17T00:01:00.000Z', passed: true, detail: 'Recorded check.' },
}

describe('Week 07 Markdown responses', () => {
  it('renders every exact prompt, supplied setup, verbatim response, model source, and recorded run evidence', () => {
    const markdown = renderWeek07Responses(submission)
    for (const [id, prompt] of Object.entries(WEEK07_FIELD_PROMPTS)) {
      expect(markdown).toContain(`### ${id === 'aiUse' ? 'AI use' : id}`)
      expect(markdown).toContain(`**Prompt:** ${prompt}`)
      expect(markdown).toContain(`Answer for ${id}: ${prompt}`)
    }
    for (const [id, value] of Object.entries(WEEK07_SUPPLIED_SETUP)) expect(markdown).toContain(`### ${id} — instructor supplied\n${value}`)
    expect(markdown).toContain('The recorded model JSON/expression source follows exactly as supplied.')
    expect(markdown).toContain('"expression": "a * b"')
    expect(markdown).toContain('Recorded as passed for the submitted model hash.')
    expect(markdown).toContain('requiredMoment=1350 N*m')
    expect(markdown).toContain('does not recompute or independently validate')
  })

  it('marks missing answers and absent run evidence explicitly', () => {
    const markdown = renderWeek07Responses({ record: { fields: { physics: { text: '' } } }, runs: [] })
    expect(markdown).toContain('### physics')
    expect(markdown).toContain('_Missing — no response supplied._')
    expect(markdown).toContain('_Missing — no model runs supplied._')
    expect(markdown).toContain('No verification record was supplied.')
  })

  it('preserves multiline answers and backticks with a safe fence', () => {
    const value = 'First line\n```json\n{"answer": true}\n```\nLast line'
    const markdown = renderWeek07Responses({ record: { fields: { physics: { text: value } } } })
    expect(markdown).toContain(value)
    expect(markdown).toContain('````\nFirst line')
  })

  it('keeps each recorded prediction fence separate from run list items and code-formats values', () => {
    const firstRun = submission.runs[0]
    const markdown = renderWeek07Responses({
      ...submission,
      runs: [firstRun, { ...firstRun, id: 'run-2', prediction: 'Second prediction.' }],
    })

    expect(markdown).toContain('- Prediction recorded with run:\n\n```\nPositive elevator moment.\n```\n- Result status:')
    expect(markdown).toContain('- Prediction recorded with run:\n\n```\nSecond prediction.\n```\n- Result status:')
    expect(markdown).toContain('- Values: `requiredMoment=1350 N*m`; `dynamicPressure=980 Pa`')
  })

  it('reports stale verification instead of presenting it as current', () => {
    const markdown = renderWeek07Responses({ record: { modelHash: 'new', fields: {} }, verification: { modelHash: 'old', checkedAt: 'then', passed: true, detail: 'old result' } })
    expect(markdown).toContain('Stale verification record: it applies to old, while the submitted model is new.')
    expect(markdown).not.toContain('Recorded as passed for the submitted model hash.')
  })

  it('is deterministic for the same submission', () => {
    expect(renderWeek07Responses(submission)).toBe(renderWeek07Responses(structuredClone(submission)))
  })
})
