from panphon.distance import Distance
from panphon.featuretable import FeatureTable

# Initialize tools
ft = FeatureTable()
dst = Distance()

# Constants for phonological edit distance

MAX_FEATURE_DIFFS = len(ft.names)
"""
Maximum number of phonological features available in the feature table.
Used to define a substitution ceiling for penalty calculation.
"""

INSERTION_COST = MAX_FEATURE_DIFFS + 1
"""
Fixed cost for inserting a segment during alignment.
Set slightly higher than the maximum possible substitution cost to prefer substitutions over insert/delete.
"""

DELETION_COST = MAX_FEATURE_DIFFS + 1
"""
Fixed cost for deleting a segment during alignment.
Set to match INSERTION_COST for symmetry.
"""

UNKNOWN_COST = MAX_FEATURE_DIFFS
"""
Cost assigned when one or both segments in comparison are unknown or missing from the feature table.
"""

ipa_map = {
    "Sanskrit": "nɑːrəŋɡ",
    "Classical Persian": "nɑː.ˈɾaŋɡ",
    "Arabic": "naː.rand͡ʒ",
    "Old Spanish": "naˈɾãŋ.xa",
    "Latin": "aˈran.t͡ʃa",
    "Old French": "ɔˈrɛndʒə",
    "Dutch": "ˌoːˈrɑn.jə",
    "Indonesian": "oˈra.ɲə"
}
"""
Mapping of languages to their corresponding IPA word forms in a historical evolution chain.
Used for pairwise phonological comparison.
"""

def phonological_cost(a: str, b: str, ft: FeatureTable) -> int:
    """
    Computes the phonological substitution cost between two IPA segments using the PanPhon feature table.

    Args:
        a (str): First IPA segment.
        b (str): Second IPA segment.
        ft (FeatureTable): PanPhon FeatureTable instance.

    Returns:
        int: The number of differing phonological features between segments,
            or insertion/deletion/unknown penalties as applicable.
    """
    if a == b:
        return 0
    if a is None or b is None:
        return INSERTION_COST if a is None else DELETION_COST
    f1 = ft.fts(a)
    f2 = ft.fts(b)
    if not f1 or not f2:
        return UNKNOWN_COST
    return len(f1.differing_specs(f2))

def align_segments(seg1: list[str], seg2: list[str], ft: FeatureTable) -> list[tuple[str, str]]:
    """
    Aligns two IPA segment lists using dynamic programming with phonological feature-based costs.

    Args:
        seg1 (list[str]): List of IPA segments from the first word.
        seg2 (list[str]): List of IPA segments from the second word.
        ft (FeatureTable): PanPhon FeatureTable instance.

    Returns:
        list[tuple[str, str]]: A list of aligned segment pairs (with `None` used for insertions/deletions).
    """
    m, n = len(seg1), len(seg2)
    dp = [[float('inf')] * (n + 1) for _ in range(m + 1)]
    back = [[None] * (n + 1) for _ in range(m + 1)]
    dp[0][0] = 0

    for i in range(m + 1):
        for j in range(n + 1):
            if i < m and j < n:
                sub_cost = phonological_cost(seg1[i], seg2[j], ft)
                if dp[i + 1][j + 1] > dp[i][j] + sub_cost:
                    dp[i + 1][j + 1] = dp[i][j] + sub_cost
                    back[i + 1][j + 1] = (i, j)
            if i < m:
                del_cost = DELETION_COST
                if dp[i + 1][j] > dp[i][j] + del_cost:
                    dp[i + 1][j] = dp[i][j] + del_cost
                    back[i + 1][j] = (i, j)
            if j < n:
                ins_cost = INSERTION_COST
                if dp[i][j + 1] > dp[i][j] + ins_cost:
                    dp[i][j + 1] = dp[i][j] + ins_cost
                    back[i][j + 1] = (i, j)

    i, j = m, n
    aligned = []
    while i > 0 or j > 0:
        prev = back[i][j]
        if prev is None:
            break
        pi, pj = prev
        a = seg1[pi] if i - pi == 1 else None
        b = seg2[pj] if j - pj == 1 else None
        aligned.append((a, b))
        i, j = pi, pj

    return aligned[::-1]

def compare_words(word1: str, word2: str, ft: FeatureTable, label1="Word 1", label2="Word 2") -> None:
    """
    Compares two IPA words by segmenting them and displaying phonological differences.

    Args:
        word1 (str): The first IPA word.
        word2 (str): The second IPA word.
        ft (FeatureTable): PanPhon FeatureTable instance.
        label1 (str): Label for the first language/stage.
        label2 (str): Label for the second language/stage.

    Prints:
        A step-by-step display of aligned IPA segments, their match status,
        and number of phonological feature differences.
    """
    segs1 = ft.ipa_segs(word1)
    segs2 = ft.ipa_segs(word2)
    alignment = align_segments(segs1, segs2, ft)

    print(f"{label1} → {label2}")
    print(f"  IPA: {word1} → {word2}")
    print(f"  Segments: {segs1} → {segs2}")
    for s1, s2 in alignment:
        if s1 and s2:
            fa = ft.fts(s1)
            fb = ft.fts(s2)
            if fa and fb:
                diffs = fa.differing_specs(fb)
                diff_count = len(diffs)
                if diff_count == 0:
                    print(f"    {s1:<4} → {s2:<4} | 0 feature diffs")
                else:
                    def symbol(v):
                        return {1: '+', 0: '0', -1: '-'}.get(v, '?')

                    diff_lines = []
                    for feat in diffs:
                        before = symbol(fa[feat])
                        after = symbol(fb[feat])
                        diff_lines.append(f"{feat}: {before} → {after}")
                    diff_block = ', '.join(diff_lines)

                    print(f"    {s1:<4} → {s2:<4} | {diff_count} feature diff{'s' if diff_count != 1 else ''}: [{diff_block}]")
            else:
                print(f"    {s1:<4} → {s2:<4} | unknown segment(s)")
        elif s1 and not s2:
            print(f"    {s1:<4} → -    | Deletion")
        elif s2 and not s1:
            print(f"    -    → {s2:<4} | Insertion")
    print()

# Run pairwise comparisons across all IPA transitions in order
ipa_items = list(ipa_map.items())
for i in range(len(ipa_items) - 1):
    label1, word1 = ipa_items[i]
    label2, word2 = ipa_items[i + 1]
    compare_words(word1, word2, ft, label1, label2)
