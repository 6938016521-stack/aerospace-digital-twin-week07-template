// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from '../../src/app/App'
import { createAppCatalog } from '../../src/app/catalog'
import { createParameterStore } from '../../src/app/parameter-workspace'
afterEach(cleanup)
it('enables the bundled demo, shows live output, verifies, disables and logs activation', () => {
  const store = createParameterStore()
  render(<App store={store} catalog={createAppCatalog()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Modules' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enable Airspeed signal check' }))
  expect(screen.getByText(/Unconfigured · supply airspeed/)).toBeVisible()
  fireEvent.change(screen.getByLabelText('Value (m/s)'), { target: { value: '25' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply parameter' }))
  expect(within(screen.getByRole('region', { name: 'Module runtime' })).getByText('25 m/s')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Verify Airspeed signal check' }))
  expect(screen.getByText(/PASS · 25 m\/s passes through/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Disable Airspeed signal check' }))
  expect(screen.queryByText('Registered module output · no flight response implied')).not.toBeInTheDocument()
  expect(store.getSnapshot().state.outputs).toEqual({})
  expect(store.getSnapshot().events).toHaveLength(3)
})
