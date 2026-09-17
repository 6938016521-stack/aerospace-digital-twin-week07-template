import { useEffect, useRef, useState } from 'react'

type Status = { available: boolean; token?: string; repositoryUrl?: string; branch?: string; reason?: string; message?: string }
type Result = { error?: string; ok: boolean; pushed?: boolean; commitSha?: string; commitUrl?: string; repositoryUrl?: string; message?: string }

export function GitHubSave({ submission }: { submission: unknown }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [savedText, setSavedText] = useState('')
  const inFlight = useRef(false)
  const currentText = JSON.stringify(submission)
  useEffect(() => {
    let active = true
    fetch('/api/student/github/status', { credentials: 'same-origin' })
      .then(async response => {
        if (!response.ok) throw new Error('Open your fork in Codespaces and run npm run dev to save to GitHub.')
        const data = await response.json() as Status
        if (active) setStatus(data)
      })
      .catch(() => { if (active) setStatus({ available: false, reason: 'Open your fork in Codespaces and run npm run dev to save to GitHub. Downloads remain available below.' }) })
    return () => { active = false }
  }, [])
  async function save() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setResult(null)
    const snapshot = currentText
    try {
      // Refresh the per-server token so a development-server restart is recoverable.
      const statusResponse = await fetch('/api/student/github/status', { credentials: 'same-origin' })
      if (!statusResponse.ok) throw new Error('GitHub saving is unavailable. Run this app in your fork’s Codespace.')
      const latest = await statusResponse.json() as Status
      setStatus(latest)
      if (!latest.available || !latest.token) throw new Error(latest.reason ?? latest.message ?? 'GitHub saving is unavailable.')
      const response = await fetch('/api/student/github/save', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Student-Save-Token': latest.token }, body: JSON.stringify({ submission: JSON.parse(snapshot) }) })
      const data = await response.json() as Result
      setResult({ ...data, message: data.message ?? data.error ?? (!response.ok ? 'Save failed. Your draft is still available; try again or export it.' : '') })
      if (response.ok && data.ok && data.pushed) setSavedText(snapshot)
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : 'Save failed. Your browser draft is still available.' })
    } finally { setBusy(false); inFlight.current = false }
  }
  return <section className="github-save" aria-label="Save responses to GitHub">
    <button onClick={() => void save()} disabled={busy}>{busy ? 'Saving and pushing…' : 'Save to GitHub'}</button>
    <p>Creates a commit with your current answers, model and responses.md, then pushes to your fork. You can save incomplete work.</p>
    {status?.available && <p>Destination: <a href={status.repositoryUrl} target="_blank" rel="noreferrer">your fork</a> · {status.branch}</p>}
    {status && !status.available && <p>{status.reason ?? status.message}</p>}
    <div role="status" aria-live="polite">
      {result && <p>{result.ok && result.pushed ? 'Saved on GitHub.' : 'Not saved on GitHub.'} {result.message}</p>}
      {result?.commitSha && <p>{result.pushed ? 'Submitted commit' : 'Local commit'}: {result.commitUrl && result.pushed ? <a href={result.commitUrl} target="_blank" rel="noreferrer">{result.commitSha}</a> : <code>{result.commitSha}</code>}</p>}
      {savedText && savedText !== currentText && <p>You have changes since your last GitHub save. Click Save to GitHub again.</p>}
    </div>
  </section>
}
