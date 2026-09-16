import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'artifacts', 'output'] },
  js.configs.recommended,
  { files: ['scripts/**/*.{js,mjs}'], languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'three', 'three/*', '@react-three/*'], message: 'The platform is framework-independent.' },
          { group: ['**/modules/**', '**/scene/**', '**/app/**', '**/student/**'], message: 'The platform must not import application adapters or course content.' },
        ],
      }],
    },
  },
)
