import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { githubSavePlugin } from './scripts/student/github-save'

export default defineConfig({
  plugins: [react(), githubSavePlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
})
