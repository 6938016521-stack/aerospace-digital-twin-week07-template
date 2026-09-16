import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createAppCatalog } from './app/catalog'
import './app/styles.css'
import './app/parameters.css'

// Explicit diagnostic route for the P0 empty-registry browser acceptance check.
const includePlaceholders = new URLSearchParams(window.location.search).get('catalog') !== 'empty'
const root = document.getElementById('root')
if (!root) throw new Error('Application root element is missing.')

createRoot(root).render(
  <StrictMode>
    <App catalog={createAppCatalog(includePlaceholders)} />
  </StrictMode>,
)
