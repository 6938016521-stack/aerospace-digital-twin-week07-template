// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../../src/app/App'
import { createAppCatalog } from '../../src/app/catalog'
import { createParameterStore } from '../../src/app/parameter-workspace'
afterEach(cleanup)
it('enables four controls, preserves radians and physical unknowns, and resets', () => {
  const store = createParameterStore()
  render(<App store={store} catalog={createAppCatalog()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Start controls exploration' }))
  for (const name of ['elevator','aileron','rudder','flap'] as const) {
    fireEvent.change(screen.getByRole('slider', { name: `${name} deflection slider` }), { target: { value: '15' } })
    const state = store.getSnapshot().state
    const output = state.outputs.controls?.[`${name}Preview`]
    expect(output?.status === 'known' && output.value).toBeCloseTo(Math.PI / 12)
    expect(state.controls[name].status).toBe('unconfigured')
  }
  expect(store.getSnapshot().events).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: 'Reset scenario' }))
  expect(screen.getByRole('button', { name: 'Start controls exploration' })).toBeVisible()
  expect(store.getSnapshot().state.outputs).toEqual({})
})
it('instructor poses change only the focused surface, and blank numeric entry is rejected', () => {
  const store = createParameterStore()
  render(<App store={store} catalog={createAppCatalog()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Start controls exploration' }))
  fireEvent.click(screen.getByRole('button', { name: 'Focus rudder' }))
  fireEvent.click(screen.getByRole('button', { name: '+10° rudder' }))
  expect(store.getSnapshot().state.controls.elevatorCommanded.status).toBe('unconfigured')
  expect(store.getSnapshot().events.at(-1)?.command.type).toBe('SET_RUDDER')
  fireEvent.click(screen.getByRole('button', { name: 'Apply elevator' }))
  expect(screen.getByRole('alert')).toHaveTextContent('blank field is not zero')
  expect(store.getSnapshot().events).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('elevator angle (deg)'), { target: { value: '45' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply elevator' }))
  const value = store.getSnapshot().state.controls.elevatorCommanded
  expect(value.status === 'known' && value.value).toBeCloseTo(Math.PI / 4)
  expect(store.getRuntime()!.verify('controls').every((result) => result.passed)).toBe(true)
})
