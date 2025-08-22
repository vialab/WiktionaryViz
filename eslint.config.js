import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
// Prettier config to disable conflicting ESLint formatting rules
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Relax explicit any usage: still surfaces as a warning but won't fail CI.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Apply prettier last to turn off all style rules that might conflict with Prettier's output
  {
    files: ['**/*.{js,ts,tsx,jsx}'],
    extends: [prettier],
  },
)
