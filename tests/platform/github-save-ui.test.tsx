// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GitHubSave } from '../../src/student/GitHubSave'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const status = { available: true, token: 'session-token', repositoryUrl: 'https://github.com/student/work', branch: 'main' }
const response = (data: unknown, ok = true) => ({ ok, json: async () => data })
it('saves the clicked snapshot, reports pushed SHA and identifies subsequent unsaved changes', async () => {
 const fetch = vi.fn().mockResolvedValue(response(status))
 vi.stubGlobal('fetch', fetch)
 const { rerender } = render(<GitHubSave submission={{ answer: 'first' }} />)
 await screen.findByText('your fork')
 fetch.mockResolvedValueOnce(response(status)).mockResolvedValueOnce(response({ ok: true, pushed: true, commitSha: 'a'.repeat(40), commitUrl: 'https://github.com/student/work/commit/'+ 'a'.repeat(40) }))
 fireEvent.click(screen.getByRole('button', { name: 'Save to GitHub' }))
 await screen.findByText(/Saved on GitHub/)
 const call = fetch.mock.calls.find(call => call[0] === '/api/student/github/save')!
 expect(JSON.parse(call[1].body)).toEqual({ submission: { answer: 'first' } })
 expect(call[1].headers['X-Student-Save-Token']).toBe('session-token')
 rerender(<GitHubSave submission={{ answer: 'changed' }} />)
 expect(screen.getByText(/changes since your last GitHub save/)).toBeTruthy()
})
it('does not claim GitHub success when a local commit cannot push', async () => {
 const fetch = vi.fn().mockResolvedValue(response(status)); vi.stubGlobal('fetch', fetch)
 render(<GitHubSave submission={{ answer: 'incomplete' }} />)
 await screen.findByText('your fork')
 fetch.mockResolvedValueOnce(response(status)).mockResolvedValueOnce(response({ ok: false, pushed: false, commitSha: 'b'.repeat(40), message: 'Local commit saved; push failed. Retry.' }, false))
 fireEvent.click(screen.getByRole('button', { name: 'Save to GitHub' }))
 await screen.findByText(/Not saved on GitHub/)
 expect(screen.getByText(/Local commit:/)).toBeTruthy()
 await waitFor(() => expect(screen.getByRole('button', { name: 'Save to GitHub' }).hasAttribute('disabled')).toBe(false))
})
