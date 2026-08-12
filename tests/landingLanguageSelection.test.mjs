import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveAutoLanguageSelection } from '../src/utils/languageSelection.ts'

test('prefills the only valid language for a suggestion', () => {
  const selected = resolveAutoLanguageSelection('', [{ code: 'eng', name: 'English' }], 'English')
  assert.equal(selected, 'eng')
})

test('keeps a valid current language when multiple options exist', () => {
  const selected = resolveAutoLanguageSelection('fra', [
    { code: 'eng', name: 'English' },
    { code: 'fra', name: 'French' },
  ])
  assert.equal(selected, 'fra')
})

test('falls back to the existing value when no auto-selection applies', () => {
  const selected = resolveAutoLanguageSelection('deu', [{ code: 'eng', name: 'English' }, { code: 'fra', name: 'French' }])
  assert.equal(selected, 'deu')
})
