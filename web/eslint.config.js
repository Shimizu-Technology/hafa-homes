import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // This app intentionally synchronizes modal/editor state from server-backed props.
      // The exhaustive-deps rule still guards those effects against stale inputs.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/contexts/**/*.tsx', 'src/main.tsx'],
    rules: {
      // Context modules export their provider and matching hook as one public unit.
      'react-refresh/only-export-components': 'off',
    },
  },
])
