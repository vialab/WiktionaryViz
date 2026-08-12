import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api_routes.word_data import build_random_interest_entry


class TestRandomInterestEntry(unittest.TestCase):
    def test_build_random_interest_entry_includes_lang_name_and_gloss(self):
        raw_entry = {
            "word": "water",
            "lang_code": "en",
            "senses": [{
                "glosses": [
                    "A transparent, tasteless, odorless liquid that forms the seas, lakes, rivers, and rain and is essential for life."
                ]
            }],
        }

        result = build_random_interest_entry("most_translations", raw_entry)

        self.assertEqual(result["word"], "water")
        self.assertEqual(result["lang_name"], "English")
        self.assertIn("transparent", result["gloss"].lower())


if __name__ == "__main__":
    unittest.main()
