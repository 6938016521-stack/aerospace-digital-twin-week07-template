// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../../src/app/App'
import { createAppCatalog } from '../../src/app/catalog'
import { createParameterStore } from '../../src/app/parameter-workspace'
import { degreesToRadians, radiansToDegrees } from '../../src/platform/units/conversions'

afterEach(cleanup)

describe('parameter workspace', () => {
  it('applies a value through the store, logs it and resets without losing history', () => {
    const store = createParameterStore()
    render(<App catalog={createAppCatalog()} store={store} />)
    fireEvent.change(screen.getByLabelText('Value (m/s)'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply parameter' }))
    expect(screen.getByLabelText('Parameter canonical value')).toHaveTextContent('25 m/s')
    expect(screen.getByText('53 unconfigured')).toBeVisible()
    expect(store.getSnapshot().events).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reset scenario' }))
    expect(screen.getByLabelText('Parameter canonical value')).toHaveTextContent('Unconfigured (m/s)')
    expect(screen.getByText('54 unconfigured')).toBeVisible()
    expect(store.getSnapshot().events).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Experiment history ·/ }))
    expect(screen.getByText('#2 Scenario reset')).toBeVisible()
  })

  it('converts degree inputs to canonical radians', () => {
    const store = createParameterStore()
    render(<App catalog={createAppCatalog()} store={store} />)
    fireEvent.change(screen.getByLabelText('Parameter'), { target: { value: 'SET_ELEVATOR' } })
    fireEvent.change(screen.getByLabelText('Value (deg)'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply parameter' }))
    const value = store.getSnapshot().state.controls.elevatorCommanded
    expect(value.status === 'known' && value.value).toBeCloseTo(Math.PI / 12)
    expect(screen.getByText('15 deg in display units')).toBeVisible()
    expect(store.getSnapshot().state.controls.elevator.status).toBe('unconfigured')
  })

  it('rejects blanks and negative airspeed without changing state', () => {
    const store = createParameterStore()
    render(<App catalog={createAppCatalog()} store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply parameter' }))
    expect(screen.getByRole('alert')).toHaveTextContent('blank field is not zero')
    fireEvent.change(screen.getByLabelText('Value (m/s)'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply parameter' }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least 0')
    expect(store.getSnapshot().events).toHaveLength(0)
  })

  it('requires all CG coordinates and updates/reset their shared readback', () => {
    const store = createParameterStore()
    render(<App catalog={createAppCatalog()} store={store} />)
    fireEvent.change(screen.getByLabelText('CG x (m)'), { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply CG' }))
    expect(store.getSnapshot().events).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('CG y (m)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('CG z (m)'), { target: { value: '-0.25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply CG' }))
    expect(screen.getByLabelText('CG x canonical')).toHaveTextContent('1.5 m')
    expect(screen.getByLabelText('CG z canonical')).toHaveTextContent('-0.25 m')
    expect(store.getSnapshot().events).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reset scenario' }))
    expect(screen.getByLabelText('CG x canonical')).toHaveTextContent('Unconfigured')
  })
})

describe('angle display conversions', () => {
  it('round-trips signs, zero and representative angles', () => {
    for (const value of [-180, -15, 0, 30, 180]) expect(radiansToDegrees(degreesToRadians(value))).toBeCloseTo(value)
  })
  it('rejects nonfinite angles', () => {
    expect(() => degreesToRadians(NaN)).toThrow()
    expect(() => radiansToDegrees(Infinity)).toThrow()
    expect(() => radiansToDegrees(Number.MAX_VALUE)).toThrow('Converted angle')
  })
})
