from panphon.distance import Distance
from panphon.featuretable import FeatureTable
from Bio import Align
import matplotlib.pyplot as plt

# Define IPA evolution map
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

# Init tools
ft = FeatureTable()
dst = Distance()
aligner = Align.PairwiseAligner()
aligner.mode = "global"
aligner.open_gap_score = -5
aligner.extend_gap_score = -1
aligner.match_score = 0 
aligner.mismatch_score = 0 

languages = list(ipa_map.keys())
ipa_sequence = list(ipa_map.values())

# Build all IPA segments for scoring
all_segments = sorted(set(s for ipa in ipa_sequence for s in ft.ipa_segs(ipa)))
from Bio.Align.substitution_matrices import Array
matrix = Array(tuple(all_segments), dims=2)

# Fill in substitution scores: max = 0, min = -N
for i, s1 in enumerate(all_segments):
    for j, s2 in enumerate(all_segments):
        if s1 == s2:
            matrix[i, j] = 0
        else:
            try:
                v1 = ft.word_to_vector_list(s1, numeric=True)[0]
                v2 = ft.word_to_vector_list(s2, numeric=True)[0]
                diff = sum(abs(x - y) for x, y in zip(v1, v2))
                matrix[i, j] = -diff
            except Exception:
                matrix[i, j] = -10

aligner.substitution_matrix = matrix

# Collect drift info
drift_scores = []
transition_labels = []
print("\n=== PHONETIC DRIFT SUMMARY ===\n")

for i in range(len(ipa_sequence) - 1):
    lang1 = languages[i]
    lang2 = languages[i + 1]
    ipa1 = ipa_sequence[i]
    ipa2 = ipa_sequence[i + 1]

    segments1 = ft.ipa_segs(ipa1)
    segments2 = ft.ipa_segs(ipa2)

    raw_distance = dst.weighted_feature_edit_distance(ipa1, ipa2)
    avg_len = (len(segments1) + len(segments2)) / 2
    normalized = raw_distance / avg_len
    drift_scores.append(normalized)
    transition_labels.append(f"{lang1}→{lang2}")

    alignment = aligner.align(segments1, segments2)[0]
    aligned1 = alignment.target
    aligned2 = alignment.query

    print(f"{lang1} → {lang2}")
    print(f"  IPA: {ipa1} → {ipa2}")
    print(f"  Segments: {segments1} → {segments2}")
    print(f"  Raw Weighted Distance: {raw_distance:.2f}")
    print(f"  Avg Segment Count: {avg_len:.2f}")
    print(f"  Normalized Drift per Segment: {normalized:.2f}")
    print(f"  Feature Differences by Aligned Segments:")

    for s1, s2 in zip(aligned1, aligned2):
        if s1 == "-" and s2 != "-":
            print(f"    {'-':<4} → {s2:<4} | Insertion")
        elif s2 == "-" and s1 != "-":
            print(f"    {s1:<4} → {'-':<4} | Deletion")
        elif s1 == s2:
            print(f"    {s1:<4} → {s2:<4} | 0 feature diffs")
        else:
            try:
                v1 = ft.word_to_vector_list(s1, numeric=True)[0]
                v2 = ft.word_to_vector_list(s2, numeric=True)[0]
                diff_count = sum(x != y for x, y in zip(v1, v2))
                print(f"    {s1:<4} → {s2:<4} | {diff_count} feature diff{'s' if diff_count != 1 else ''}")
            except:
                print(f"    {s1 or '-':<4} → {s2 or '-':<4} | Unable to compare")
    print()

# === Plot Drift Accumulation ===
cumulative_drift = [0]
for d in drift_scores:
    cumulative_drift.append(cumulative_drift[-1] + d)

max_drift = max(cumulative_drift)
node_sizes = [300 + 1700 * (d / max_drift) for d in cumulative_drift]
x_positions = list(range(len(languages)))

fig, ax = plt.subplots(figsize=(13, 3))
ax.scatter(x_positions, [0] * len(x_positions), s=node_sizes, c='tomato', alpha=0.7, edgecolors='black')

for i, label in enumerate(transition_labels):
    ax.annotate(label, (x_positions[i + 1], 0.2), rotation=45, ha='center', fontsize=9)

ax.set_yticks([])
ax.set_xticks(x_positions)
ax.set_xticklabels(languages, fontsize=10)
ax.set_title("Phonetic Drift Between Languages (PairwiseAligner, Node Size = Drift)")
plt.tight_layout()
plt.show()
