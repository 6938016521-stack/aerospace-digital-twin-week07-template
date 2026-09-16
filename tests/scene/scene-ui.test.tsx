// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../../src/app/App'
import { createAppCatalog } from '../../src/app/catalog'
import { createParameterStore } from '../../src/app/parameter-workspace'
afterEach(cleanup)
it('keeps numeric interaction available without WebGL and preserves scene options while resetting CG', () => {
  const store = createParameterStore()
  render(<App catalog={createAppCatalog(false)} store={store} />)
  expect(screen.getByText(/WebGL unavailable/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Top' }))
  fireEvent.change(screen.getByRole('slider', { name: 'Aircraft transparency' }), { target: { value: '65' } })
  fireEvent.click(screen.getByText('Scene tools & CG marker'))
  fireEvent.click(screen.getByRole('button', { name: 'Set CG at visual origin' }))
  expect(store.getSnapshot().events).toHaveLength(1)
  expect(screen.getByLabelText('Drag CG')).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Reset scenario' }))
  expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('slider', { name: 'Aircraft transparency' })).toHaveValue('65')
  expect(screen.getByLabelText('Drag CG')).toBeDisabled()
  expect(screen.getByText('Unconfigured · marker hidden')).toBeVisible()
  expect(store.getSnapshot().events).toHaveLength(2)
})
it('hides controls without losing state and connects surface selection to its command slider', () => {
  const store = createParameterStore()
  render(<App catalog={createAppCatalog()} store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'Elevator' }))
  fireEvent.change(screen.getByRole('slider', { name: 'Elevator command slider' }), { target: { value: '15' } })
  const value = store.getSnapshot().state.controls.elevatorCommanded
  expect(value.status === 'known' && value.value).toBeCloseTo(Math.PI / 12)
  fireEvent.click(screen.getByRole('button', { name: 'Hide controls' }))
  expect(screen.getByRole('button', { name: 'Show controls' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: 'Apply parameter' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Show controls' }))
  expect(Number((screen.getByRole('slider', { name: 'Elevator command slider' }) as HTMLInputElement).value)).toBeCloseTo(15)
  expect(store.getSnapshot().events).toHaveLength(1)
})
