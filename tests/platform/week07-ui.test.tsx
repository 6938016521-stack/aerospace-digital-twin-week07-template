// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Week07Lab } from '../../src/student/Week07Lab'
import { instructorWeek07ReferenceArtifact } from '../../src/student/lab'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Week 07 student lab', () => {
  it('gates runs, records a validated student model, and preserves the run locally', () => {
    localStorage.clear()
    render(<Week07Lab />)
    expect(screen.queryByRole('button', { name: 'Run my model' })).toBeNull()
    fireEvent.change(screen.getByLabelText('physics'), { target: { value: 'A force aft of CG produces a moment.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next section' }))
    fireEvent.change(screen.getByLabelText('assumptions'), { target: { value: 'Planar and linear for this range.' } })
    fireEvent.change(screen.getByLabelText('model'), { target: { value: 'Moment demand and elevator increment are evaluated.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next section' }))
    fireEvent.change(screen.getByLabelText('prediction'), { target: { value: 'The negative elevator produces a positive moment and half speed quarters it.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next section' }))
    fireEvent.change(screen.getByLabelText('Model JSON'), { target: { value: JSON.stringify(instructorWeek07ReferenceArtifact) } })
    fireEvent.click(screen.getByRole('button', { name: 'Run my model' }))
    expect(screen.getByText(/Recorded baseline run/)).toBeTruthy()
    expect(screen.getByText(/Preserved runs \(1\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run verification checks' }))
    expect(screen.getByText(/Student artifact passed demand/)).toBeTruthy()
    expect(localStorage.getItem('aerolab-week07-v1')).toContain('runs')
    fireEvent.change(screen.getByLabelText('Model JSON'), { target: { value: '{bad json' } })
    expect(screen.getByLabelText('Student results').textContent).toContain('Unavailable — no valid student result')
  })

  it('plays only the newly run student model for two seconds and replays from rest', () => {
    vi.useFakeTimers()
    try {
      localStorage.clear()
      const lab = render(<Week07Lab />)
      fireEvent.change(lab.getByLabelText('physics'), { target: { value: 'Pitch moment.' } })
      fireEvent.click(lab.getByRole('button', { name: 'Next section' }))
      fireEvent.change(lab.getByLabelText('assumptions'), { target: { value: 'Linear response.' } })
      fireEvent.change(lab.getByLabelText('model'), { target: { value: 'Evaluate moment.' } })
      fireEvent.click(lab.getByRole('button', { name: 'Next section' }))
      fireEvent.change(lab.getByLabelText('prediction'), { target: { value: 'Positive pitch response.' } })
      fireEvent.click(lab.getByRole('button', { name: 'Next section' }))
      fireEvent.change(lab.getByLabelText('Model JSON'), { target: { value: JSON.stringify(instructorWeek07ReferenceArtifact) } })
      fireEvent.click(lab.getByRole('button', { name: 'Run my model' }))
      expect(lab.getByRole('region', { name: 'Student pitch demonstration' }).textContent).toContain('Elapsed time: 0.00 s')
      act(() => vi.advanceTimersByTime(2050))
      const demonstration = lab.getByRole('region', { name: 'Student pitch demonstration' })
      expect(demonstration.textContent).toContain('Elapsed time: 2.00 s')
      expect(demonstration.textContent).toContain('Pitch angle: 20.44°')
      expect((lab.getByRole('button', { name: 'Resume pitch' }) as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(lab.getByRole('button', { name: 'Replay from rest' }))
      expect(lab.getByRole('region', { name: 'Student pitch demonstration' }).textContent).toContain('Elapsed time: 0.00 s')
      fireEvent.change(lab.getByLabelText('Investigation'), { target: { value: 'half-speed' } })
      fireEvent.click(lab.getByRole('button', { name: 'Run my model' }))
      fireEvent.click(lab.getByRole('button', { name: 'Pause pitch' }))
      act(() => vi.advanceTimersByTime(100))
      expect(lab.getByRole('region', { name: 'Student pitch demonstration' }).textContent).toContain('Elapsed time: 0.00 s')
      fireEvent.click(lab.getByRole('button', { name: 'Resume pitch' }))
      act(() => vi.advanceTimersByTime(2050))
      expect(lab.getByRole('region', { name: 'Student pitch demonstration' }).textContent).toContain('Pitch angle: -7.78°')
      fireEvent.change(lab.getByLabelText('Model JSON'), { target: { value: '{bad json' } })
      expect(lab.queryByRole('region', { name: 'Student pitch demonstration' })).toBeNull()
    } finally { vi.useRealTimers() }
  })
})
