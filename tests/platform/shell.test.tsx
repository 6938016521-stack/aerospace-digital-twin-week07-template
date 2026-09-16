// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { App } from '../../src/app/App'
import { createAppCatalog } from '../../src/app/catalog'
import { createLessonRegistry, createModuleRegistry } from '../../src/platform'
import { demoLesson, demoModule } from '../fixtures/descriptors'

afterEach(cleanup)

describe('application catalog shell', () => {
  it('boots with empty catalogs and explicit missing capabilities', () => {
    render(<App catalog={createAppCatalog(false)} />)
    expect(screen.getByRole('heading', { name: /Aerospace Digital Twin/i })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Course & status' }))
    expect(screen.getByRole('heading', { name: 'No modules registered' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'No lessons registered' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Aircraft physics not configured' })).toBeVisible()
    expect(screen.getByText('No student model supplied')).toBeVisible()
    expect(screen.getByText('No engineering record supplied')).toBeVisible()
    expect(screen.getByText(/PLATFORM API 0.1.0/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /run|pause|step/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset scenario' })).toBeVisible()
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('shows the registered controls descriptor without claiming its physics exists', () => {
    render(<App catalog={createAppCatalog()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Course & status' }))
    expect(screen.getByRole('heading', { name: 'Control Authority' })).toBeVisible()
    expect(screen.getAllByText('Descriptor provided').length).toBeGreaterThan(0)
    expect(screen.getByText('Week 06 · Pitch control: demand, response, authority')).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Start Week06 lesson' }).length).toBeGreaterThan(0)
    expect(screen.getByText('No physics model is running')).toBeVisible()
  })

  it('renders independently registered module and lesson fixtures through the same catalog interface', () => {
    const modules = createModuleRegistry()
    const lessons = createLessonRegistry()
    modules.register(demoModule())
    lessons.register(demoLesson())
    render(<App catalog={{ modules, lessons }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Course & status' }))
    expect(screen.getByRole('heading', { name: 'Synthetic module' })).toBeVisible()
    expect(screen.getByText('Synthetic lesson')).toBeVisible()
    expect(screen.queryByText('Control Authority')).not.toBeInTheDocument()
  })
})
