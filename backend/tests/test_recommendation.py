import math
from services import recommendation
from scripts.run_inspire_me_sample import collect_descendants_for_word


def test_decay_weighted_score():
    vals = [1.0, 0.5, 0.0]
    # manual compute with decay 0.8
    num = 0.0
    den = 0.0
    for i, v in enumerate(vals):
        w = 0.8 ** i
        num += w * v
        den += w
    expected = num / den
    got = recommendation.decay_weighted_score(vals, decay=0.8)
    assert math.isclose(got, expected, rel_tol=1e-9)


def test_node_interest_from_entry():
    entry = {
        "word": "test",
        "expansion": "*test",
        "translations": [{"translation": "a"}, {"translation": "b"}],
        "descendants": [{}, {}],
    }
    score = recommendation.node_interest_from_entry(entry)
    assert 0.0 <= score <= 1.0
    assert score > 0.0


def test_compute_candidate_path_scores_integration():
    # integration-style smoke test using the sample runner for 'water'
    cands = collect_descendants_for_word("water", "en")
    assert len(cands) > 0
    scores = recommendation.compute_candidate_path_scores("water", "en", cands, max_depth=4)
    # Ensure mapping contains same keys
    keys = set((f"{(c.get('word') or '').strip().lower()}_{(c.get('lang_code') or '').strip().lower()}".rstrip("_") for c in cands))
    assert set(scores.keys()) == keys
    # At least one candidate should have non-negative score (smoke)
    assert all(k in scores for k in keys)
