"""Tests for the offline descendant-counting used by the 'most descendants' stat.

Regression coverage for the production crash-loop where build_index.py raised
``RecursionError: maximum recursion depth exceeded`` in ``count_descendants_cached``
while counting descendants over a cyclic etymology graph, which aborted FastAPI
startup and put the backend container into an unbroken restart loop.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from build_index import compute_descendant_counts


def test_tree_counts_subtree_sizes():
    """On a tree, each node's count is the size of its subtree."""
    links = {
        "root": {"a", "b"},
        "a": {"c"},
        "b": set(),
        "c": set(),
    }
    counts = compute_descendant_counts(links)
    assert counts["c"] == 0
    assert counts["a"] == 1          # c
    assert counts["b"] == 0
    assert counts["root"] == 3       # a, b, c


def test_acyclic_diamond_matches_previous_subtree_semantics():
    """A shared descendant in a DAG is counted with multiplicity, exactly as the
    previous recursive implementation did. This pins behavior on acyclic graphs."""
    links = {
        "root": {"a", "b"},
        "a": {"d"},
        "b": {"d"},
        "d": set(),
    }
    counts = compute_descendant_counts(links)
    assert counts["root"] == 4       # (1+a) + (1+b) = (1+1) + (1+1)


def test_two_node_cycle_terminates_without_recursion_error():
    """A→B→A must terminate with finite counts instead of raising RecursionError."""
    links = {"A": {"B"}, "B": {"A"}}
    counts = compute_descendant_counts(links)  # must not raise
    n = len(links)
    assert set(counts) == {"A", "B"}
    assert all(isinstance(v, int) and 0 <= v < n + 1 for v in counts.values())


def test_three_node_cycle_terminates():
    links = {"A": {"B"}, "B": {"C"}, "C": {"A"}}
    counts = compute_descendant_counts(links)  # must not raise
    assert set(counts) == {"A", "B", "C"}
    assert all(0 <= v <= 3 for v in counts.values())


def test_self_loop_is_not_counted_and_terminates():
    links = {"X": {"X"}}
    counts = compute_descendant_counts(links)  # must not infinite-loop
    assert counts["X"] == 0


def test_deep_chain_exceeds_python_recursion_limit():
    """A 5000-deep chain (far beyond CPython's ~1000 frame limit) must be counted
    iteratively without RecursionError."""
    depth = 5000
    links = {f"n{i:05d}": {f"n{i + 1:05d}"} for i in range(depth)}
    links[f"n{depth:05d}"] = set()
    counts = compute_descendant_counts(links)  # must not raise RecursionError
    assert counts["n00000"] == depth
    assert counts[f"n{depth:05d}"] == 0


def test_deterministic_regardless_of_input_order():
    """Counts must not depend on dict/set iteration order (the prod symptom was a
    different crash key every run due to hash-randomized set iteration)."""
    edges = [("root", "a"), ("root", "b"), ("a", "c"), ("b", "c"), ("c", "a")]

    forward = {}
    for p, c in edges:
        forward.setdefault(p, set()).add(c)

    reversed_insertion = {}
    for p, c in reversed(edges):
        reversed_insertion.setdefault(p, set()).add(c)

    assert compute_descendant_counts(forward) == compute_descendant_counts(reversed_insertion)
