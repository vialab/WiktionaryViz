from panphon.distance import Distance
from panphon.featuretable import FeatureTable
import matplotlib.pyplot as plt

ipa1 = 'tʰiː'
ipa2 = 't͡ʃɐˈʔa'

dst = Distance()
ft = FeatureTable()

raw_distance = dst.weighted_feature_edit_distance(ipa1, ipa2)

segments1 = ft.ipa_segs(ipa1)
segments2 = ft.ipa_segs(ipa2)
print(f"Segments in {ipa1}: {segments1}")
print(f"Segments in {ipa2}: {segments2}")

num_segments = (len(segments1) + len(segments2)) / 2
normalized = raw_distance / num_segments

print(f"Raw weighted distance: {raw_distance:.2f}")
print(f"Normalized (per segment): {normalized:.2f}")

print("\nDrift Comparison:")
for i in range(max(len(segments1), len(segments2))):
    s1 = segments1[i] if i < len(segments1) else "-"
    s2 = segments2[i] if i < len(segments2) else "-"

    try:
        vec1 = ft.word_to_vector_list(s1)[0]
        vec2 = ft.word_to_vector_list(s2)[0]
    except IndexError:
        print(f"{s1:<4}  →  {s2:<4}  | Could not compare")
        continue

    # Count differing features
    mapping = {'+': 1, '-': -1, '0': 0}
    v1_num = [mapping.get(x, 0) for x in vec1]
    v2_num = [mapping.get(x, 0) for x in vec2]
    diff = sum(x != y for x, y in zip(v1_num, v2_num))

    print(f"{s1:<4}  →  {s2:<4}  | {diff} feature diff{'s' if diff != 1 else ''}")
    
# Pad to equal length
max_len = max(len(segments1), len(segments2))
segments1 += ['–'] * (max_len - len(segments1))
segments2 += ['–'] * (max_len - len(segments2))

feature_names = ft.names

# Build data for heatmap
fig, ax = plt.subplots(figsize=(max_len * 2, len(feature_names) * 0.3))
for i, (s1, s2) in enumerate(zip(segments1, segments2)):
    try:
        v1 = ft.word_to_vector_list(s1)[0]
        v2 = ft.word_to_vector_list(s2)[0]
    except IndexError:
        continue

    mapping = {'+': 1, '-': -1, '0': 0}
    v1_bin = [mapping.get(x, 0) for x in v1]
    v2_bin = [mapping.get(x, 0) for x in v2]

    for j, (a, b) in enumerate(zip(v1_bin, v2_bin)):
        if a == b:
            color = 'green'
        elif a != b:
            color = 'red'
        else:
            color = 'gray'
        ax.plot(i, j, 'o', color=color)

# Set labels
ax.set_xticks(range(max_len))
ax.set_xticklabels([f'{a} → {b}' for a, b in zip(segments1, segments2)], rotation=45)
ax.set_yticks(range(len(feature_names)))
ax.set_yticklabels(feature_names)
ax.set_title("Dot Heatmap of Feature Drift")
plt.tight_layout()
plt.show()

