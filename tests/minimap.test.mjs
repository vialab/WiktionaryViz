import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeOverviewMapZoom } from '../src/utils/minimap.ts'

test('keeps the overview viewport zoom within a sensible range', () => {
  assert.equal(normalizeOverviewMapZoom(2, 2, 8), 2)
  assert.equal(normalizeOverviewMapZoom(6, 2, 8), 6)
  assert.equal(normalizeOverviewMapZoom(10, 2, 8), 8)
  assert.equal(normalizeOverviewMapZoom(1, 2, 8), 2)
})
