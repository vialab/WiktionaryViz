import test from 'node:test'
import assert from 'node:assert/strict'

import { flattenPathsFromTree, fallbackPoint } from '../src/components/geospatial/descendantPathHelpers.js'

test('flattenPathsFromTree keeps aggregated nodes in the path', () => {
  const tree = {
    word: 'root',
    lang_code: 'la',
    children: [
      {
        word: 'child-a',
        lang_code: 'fr',
        children: [],
      },
      {
        word: 'child-b',
        lang_code: 'de',
        aggregated: true,
        count: 12,
        children: [
          {
            word: 'grandchild',
            lang_code: 'en',
            children: [],
          },
        ],
      },
    ],
  }

  const paths = flattenPathsFromTree(tree)

  assert.equal(paths.length, 2)
  assert.equal(paths[0][0].word, 'root')
  assert.equal(paths[1][1].aggregated, true)
  assert.equal(paths[1][1].count, 12)
  assert.equal(paths[1][2].word, 'grandchild')
})

test('fallbackPoint jitters points deterministically', () => {
  const first = fallbackPoint([10, 20], 0, 0, 1)
  const second = fallbackPoint([10, 20], 0, 0, 1)
  const third = fallbackPoint([10, 20], 1, 0, -1)

  assert.deepEqual(first, second)
  assert.notDeepEqual(first, third)
  assert.equal(first[0] > 10, true)
  assert.equal(first[1] > 20, true)
})