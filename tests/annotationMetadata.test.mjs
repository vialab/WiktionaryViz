import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ANNOTATION_CATEGORIES,
  defaultAnnotationCategory,
  getAnnotationCategoryLabel,
  normalizeAnnotationCategory,
} from '../src/utils/annotationMetadata.ts'

test('annotation categories expose a stable default and labels', () => {
  assert.equal(defaultAnnotationCategory, 'observation')
  assert.deepEqual(ANNOTATION_CATEGORIES.map(category => category.key), [
    'observation',
    'hypothesis',
    'question',
    'teaching',
    'presentation',
  ])
  assert.equal(getAnnotationCategoryLabel('observation'), 'Observation')
  assert.equal(getAnnotationCategoryLabel('question'), 'Question')
})

test('invalid category values normalize back to the default annotation category', () => {
  assert.equal(normalizeAnnotationCategory('unknown'), 'observation')
  assert.equal(normalizeAnnotationCategory(null), 'observation')
  assert.equal(normalizeAnnotationCategory('hypothesis'), 'hypothesis')
})
