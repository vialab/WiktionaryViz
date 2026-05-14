import json
import tempfile
from pathlib import Path
from contextlib import ExitStack
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api_routes.descendants as descendants
import constants
import services.wiktionary_io as wiktionary_io


def _build_fixture(entries):
    lines = []
    offsets = {}
    cursor = 0
    for key, entry in entries:
        line = json.dumps(entry, ensure_ascii=False)
        offsets[key] = cursor
        lines.append(line)
        cursor += len(line.encode('utf-8')) + 1

    temp = tempfile.NamedTemporaryFile('w', delete=False, encoding='utf-8', suffix='.jsonl')
    try:
        for line in lines:
            temp.write(line + '\n')
        temp.flush()
    finally:
        temp.close()
    return Path(temp.name), offsets


class DescendantsRouteTests(unittest.TestCase):
    def setUp(self):
        self.entries = [
            (
                'aurantium_la',
                {
                    'word': 'aurantium',
                    'lang_code': 'la',
                    'expansion': 'Latin root',
                    'descendants': [
                        {
                            'text': 'Old French: orenge',
                            'templates': [
                                {
                                    'name': 'desc',
                                    'args': {'1': 'orenge', '2': 'fr'},
                                    'expansion': 'Old French: orenge',
                                }
                            ],
                        },
                        {
                            'text': 'Old French: orangish',
                            'templates': [
                                {
                                    'name': 'der',
                                    'args': {'1': 'fr', '2': 'orangish'},
                                    'expansion': 'Old French: orangish',
                                }
                            ],
                        },
                        {
                            'text': 'Iberian: naranja',
                            'templates': [
                                {
                                    'name': 'desc',
                                    'args': {'1': 'naranja', 'lang': 'es'},
                                    'expansion': 'Iberian: naranja',
                                }
                            ],
                        },
                    ],
                    'etymology_templates': [],
                },
            ),
            (
                'orenge_fr',
                {
                    'word': 'orenge',
                    'lang_code': 'fr',
                    'expansion': 'Old French form',
                    'descendants': [
                        {
                            'text': 'English: orange',
                            'templates': [
                                {
                                    'name': 'desc',
                                    'args': {'1': 'orange', '2': 'en'},
                                    'expansion': 'English: orange',
                                }
                            ],
                        },
                    ],
                    'etymology_templates': [
                        {'args': {'2': 'la', '3': 'aurantium'}, 'name': 'der'}
                    ],
                },
            ),
            (
                'orange_en',
                {
                    'word': 'orange',
                    'lang_code': 'en',
                    'expansion': 'English fruit word',
                    'etymology_templates': [
                        {'args': {'2': 'fr', '3': 'orenge'}, 'name': 'bor'}
                    ],
                },
            ),
            (
                'orangish_fr',
                {
                    'word': 'orangish',
                    'lang_code': 'fr',
                    'expansion': 'Alternate French descendant',
                    'descendants': [],
                    'etymology_templates': [
                        {'args': {'2': 'la', '3': 'aurantium'}, 'name': 'der'}
                    ],
                },
            ),
            (
                'naranja_es',
                {
                    'word': 'naranja',
                    'lang_code': 'es',
                    'expansion': 'Spanish descendant',
                    'descendants': [],
                    'etymology_templates': [
                        {'args': {'2': 'la', '3': 'aurantium'}, 'name': 'der'}
                    ],
                },
            ),
        ]
        self.temp_jsonl, self.offsets = _build_fixture(self.entries)

        self.index = {key: offset for key, offset in self.offsets.items()}

        self.app = FastAPI()
        self.app.include_router(descendants.router)
        self.client = TestClient(self.app)

    def tearDown(self):
        if self.temp_jsonl.exists():
            self.temp_jsonl.unlink()

    def _patch_backend(self, stack: ExitStack):
        stack.enter_context(
            patch.multiple(
                descendants,
                index=self.index,
                JSONL_FILE_PATH=str(self.temp_jsonl),
            )
        )
        stack.enter_context(
            patch.multiple(
                constants,
                index=self.index,
                JSONL_FILE_PATH=str(self.temp_jsonl),
            )
        )
        stack.enter_context(
            patch.multiple(
                wiktionary_io,
                index=self.index,
            )
        )

    def test_ancestor_roots_resolves_expected_root(self):
        with ExitStack() as stack:
            self._patch_backend(stack)
            response = self.client.get('/ancestor-roots', params={'word': 'orange', 'lang_code': 'en'})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['query']['word'], 'orange')
        self.assertGreaterEqual(len(payload['roots']), 1)
        self.assertEqual(payload['roots'][0]['word'], 'aurantium')
        self.assertEqual(payload['roots'][0]['lang_code'], 'la')

    def test_descendant_tree_aggregated_collapses_extra_branches(self):
        with ExitStack() as stack:
            self._patch_backend(stack)
            response = self.client.get(
                '/descendant-tree-aggregated',
                params={'word': 'aurantium', 'lang_code': 'la', 'branch_limit': 1, 'max_nodes': 40},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        tree = payload['tree']
        self.assertEqual(payload['root'], 'aurantium')
        self.assertEqual(tree['name'], 'aurantium')
        self.assertGreaterEqual(len(tree['children']), 2)
        summary_nodes = [child for child in tree['children'] if child.get('aggregated')]
        self.assertTrue(summary_nodes)
        # With 3 children total and branch_limit=1, we keep 1 and aggregate 2
        self.assertEqual(summary_nodes[0]['count'], 2)

    def test_descendant_paths_resolved_returns_descendant_paths(self):
        with ExitStack() as stack:
            self._patch_backend(stack)
            response = self.client.get('/descendant-paths-resolved', params={'word': 'orange', 'lang_code': 'en'})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['selected_root']['word'], 'aurantium')
        self.assertGreaterEqual(len(payload['paths']), 2)
        root_words = {path[0]['word'] for path in payload['paths'] if path}
        self.assertEqual(root_words, {'aurantium'})


if __name__ == '__main__':
    unittest.main()