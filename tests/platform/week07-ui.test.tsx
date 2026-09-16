// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Week07Lab } from '../../src/student/Week07Lab'
import { instructorWeek07ReferenceArtifact } from '../../src/student/lab'

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
})
