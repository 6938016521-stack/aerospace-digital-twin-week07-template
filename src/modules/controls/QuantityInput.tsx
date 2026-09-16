import { useState } from 'react'
/** Drafts never masquerade as committed engineering values. */
export function QuantityInput({ label, value, unit, apply }: { label: string; value: number | undefined; unit: string; apply: (value: number) => string | null }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  return <form className="quantity-input" onSubmit={(event) => {
    event.preventDefault()
    const text = draft ?? String(value ?? '')
    let failure: string | null
    try { failure = !text.trim() || !Number.isFinite(Number(text)) ? 'Enter a finite value; blank is not zero.' : apply(Number(text)) } catch (error) { failure = error instanceof Error ? error.message : 'Input could not be applied.' }
    setError(failure ?? '')
    setDraft(null)
  }}><label>{label}<span className="quantity-active">Active: {value === undefined ? 'Unconfigured' : Number(value.toPrecision(7))} {unit}</span><input aria-label={label} aria-invalid={!!error} type="number" step="any" value={draft ?? (value === undefined ? '' : Number(value.toPrecision(10)))} onChange={(event) => { setDraft(event.target.value); setError('') }} /></label><button type="submit">Set {label}</button>{draft !== null && <span className="quantity-pending">Not applied · press Enter or Set</span>}{error && <span role="alert" className="quantity-error">{error} Active value restored.</span>}</form>
}
