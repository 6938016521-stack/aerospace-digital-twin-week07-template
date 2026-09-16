// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Week07Demonstration } from '../../src/app/Week07Demonstration'

afterEach(cleanup)
describe('prepared Week 07 demonstrations', () => {
  it.each(['demand', 'effectiveness', 'speed', 'authority', 'uncertainty', 'rate'])('%s shows its inspector and applies its prepared change', name => {
    render(<Week07Demonstration name={name} />)
    expect(screen.queryByText('Choose an experiment')).toBeNull()
    expect(screen.getByRole('button', { name: 'Calculations' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load C2 example' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Apply demonstration change' }))
    if (name === 'authority') expect(screen.getByRole('alert').textContent).toContain('Selected deflection exceeds usable travel')
    else expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Calculations' }))
    const required = screen.getByLabelText('Required control moment').textContent
    expect(required).toBe(name === 'demand' ? '750 N*m' : '1350 N*m')
    fireEvent.click(screen.getByRole('button', { name: 'Restore baseline' }))
    expect(screen.getByLabelText('Required control moment').textContent).toBe('1350 N*m')
  })
})
