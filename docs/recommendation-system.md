# Recommendation System

## 1. Purpose and design goals

The recommendation system is designed to surface promising terms for the UI in three separate layers: translations, etymology roots, and descendants. The goal is not to learn a ranking model from interaction data, but to rank candidates deterministically from the structure of the Wiktionary data itself in a manner that is interpretable, robust, and relatively fair across languages.

This is intentionally a no-training system. It does not rely on click data, user feedback, or probabilistic model fitting. Instead, it uses a small set of hand-crafted features extracted from each candidate entry and a transparent weighted combination. In practical terms, the system is designed to answer three questions:

- Which translated forms are likely to be interesting or informative?
- Which ancestral etymological roots or reconstructed forms deserve attention?
- Which descendant forms are most likely to be linguistically rich, semantically connected, and structurally informative?

The implementation is centered in [backend/services/recommendation.py](../backend/services/recommendation.py) and exposed through the `/inspire-me` endpoint in [backend/api_routes/word_data.py](../backend/api_routes/word_data.py). The design constraints are explicit:

- no training or optimization loop,
- no hard cutoff in ranking, only continuous scores in $[0,1]$,
- minimal dependence on language resource abundance,
- explainability for each result,
- robustness when explicit descendant structures are missing.

---

## 2. High-level system architecture

The recommender produces three JSON payloads, each corresponding to one ranking layer:

1. Translations
2. Etymology roots
3. Descendants

Each layer is scored independently, but all are derived from the same core idea: candidate relevance is estimated from a small set of observable features such as counts, rarity, path structure, and depth. These features are then combined using weighted linear scoring:

$$
\text{score}(c) = \sum_i w_i \cdot f_i(c)
$$

where $c$ is a candidate, $f_i$ are normalized or bounded features, and $w_i$ are deterministic weights chosen by design rather than by training.

The final score is clamped to the interval $[0,1]$:

$$
S(c) = \min\left(1, \max\left(0, \sum_i w_i f_i(c)\right)\right)
$$

This keeps the output easy to inspect and easy to compare across layers and languages.

---

## 3. Data and candidate collection

The recommendation layer operates over Wiktionary entries stored in the local JSONL database and the `index` mapping that points each lemma-language pair to a byte offset. In the prototype, candidate extraction is intentionally conservative and deterministic.

### 3.1 Candidate sources

Each recommendation layer reads from a different signal source:

- Translations: recursively inspect a word entry for nested translation objects in `senses`, `translations`, and nested dictionary/list structures.
- Etymology roots: inspect `etymology_templates` and related template arguments for ancestral words and proto-form markers.
- Descendants: use descendant tree structures when available, and when they are missing, fall back to the precomputed reverse descendant graph in `backend/data/reverse_descendant_graph.json`.

### 3.2 A note on fairness and resource bias

A naive recommendation system could easily over-rank languages with large amounts of data and many frequent forms. To avoid this, the scoring system builds several safeguards:

- counts are compressed with log transforms,
- rarity is treated as a signal rather than absolute frequency,
- low-resource languages can receive a mild heuristic boost,
- counts are normalized relative to a language-aware distribution when available.

This is not a statistical debiasing model; it is a deliberate heuristic strategy intended to keep the ranking interpretable and stable.

---

## 4. Core feature functions

The recommendation system is driven by a fixed vocabulary of deterministic features. These functions are defined in [backend/services/recommendation.py](../backend/services/recommendation.py).

### 4.1 Log compression

Heavy-tailed counts are compressed using `log1p` to avoid letting a few very large counts dominate the ranking:

$$
\operatorname{log1p}(x) = \log(1 + x)
$$

This is used for translation counts, subtree counts, and descendant counts. It substantially reduces variance while retaining the ordering information necessary for ranking.

### 4.2 Node interest score

The helper `node_interest_from_entry(entry)` computes a compact interest score for a node based on evidence such as expansion, translation richness, and descendant richness. The score is bounded to $[0,1]$.

The rough formula is:

$$
I(e) = 0.45\cdot H(e) + 0.35\cdot \frac{\log(1 + T(e))}{1 + \log(1 + T(e))} + 0.20\cdot \frac{\log(1 + D(e))}{1 + \log(1 + D(e))}
$$

where:

- $H(e) \in \{0,1\}$ indicates whether the entry has an `expansion` signal,
- $T(e)$ is the count of translations in the entry,
- $D(e)$ is the number of descendants listed for the entry.

This produces a general-purpose “signal strength” score for a node, which is then used when computing path-based evidence.

---

## 5. Path-based scoring

A central idea is that a candidate is more interesting when it appears in a path that connects to rich or meaningful linguistic structure, not just when it is isolated. For example, a candidate descendant that sits near a rich etymological subtree should be preferred over a candidate with only a single weak observation.

### 5.1 Decay-weighted path score

Given a path of node interests $[i_0, i_1, \dots, i_k]$ from the candidate back toward the root, the system computes a decay-weighted path score:

$$
\text{path\_score}(p) = \frac{\sum_{j=0}^{k} \lambda^j i_j}{\sum_{j=0}^{k} \lambda^j}
$$

where $\lambda \in (0,1]$ is the decay factor. In the implementation, the default is `decay = 0.85` or a slightly lower fallback value such as 0.8.

This ensures:

- the candidate itself matters most,
- near-root evidence still contributes,
- increasingly distant nodes contribute less,
- long noisy chains do not dominate the ranking by default.

The function is implemented as `decay_weighted_score(values, decay)` in [backend/services/recommendation.py](../backend/services/recommendation.py).

### 5.2 Why this matters

This is a deliberate contrast to a naïve average over path interest values. A naïve average over a long path would overvalue distant but weak signals. The decay term makes the scoring more stable and more faithful to linguistic intuition: the item closest to the query and most structurally connected to it is more likely to be valuable.

The score is thus a balance between local importance and path context.

---

## 6. Reverse-graph fallback for descendants

One practical issue is that many Wiktionary entries do not have explicit inline descendant lists. In those cases, the system cannot rely on a direct tree derived from the JSONL entry. The solution is a fallback based on the precomputed reverse descendant graph.

In the code, if the direct descendant tree is trivial or empty, the system:

1. loads `reverse_descendant_graph.json`,
2. finds the relevant reverse-root key for the queried word and language,
3. reconstructs a reverse tree from the graph,
4. flattens supported paths,
5. computes interest scores on that graph and attaches path evidence to each candidate.

This is crucial because the dataset is irregular. Some entries are rich; others are sparse. The fallback prevents a complete collapse of descendant scoring when explicit descendants are missing.

The reverse-graph fallback also supports a conservative signal when the explicit subtree is still too small. In that case, the code uses quick subtree counts and a bounded function to assign a modest nonzero path signal rather than silently returning zero.

---

## 7. Per-language normalization and fairness

The system includes language-aware statistics and percentile approximations in `language_stats.json`. The idea is to reduce over-bias toward highly populated, well-documented languages like English by evaluating counts relative to a language’s observed distribution rather than as absolute values.

A percentile function maps a count to an approximate percentile in the language distribution:

$$
P(v) = \text{approx percentile of } v \text{ in the language-specific distribution}
$$

This is used to normalize candidate counts when available. In the implementation, the helper is `map_count_to_percentile(lang_code, value, kind)`.

When language stats are unavailable or sparse, the code falls back to bounded transforms such as:

$$
\phi(x) = \frac{x}{1+x}
$$

and a small low-resource boost when the language is not one of the major global languages. This creates a deterministic fairness heuristic without requiring a training dataset.

---

## 8. Layer-specific scoring functions

Each layer is scored independently, with a separate weight set. This is a key design choice: the system is not a single monolithic model but a set of interpretable human-defined rankers.

### 8.1 Translation scoring

The translation layer combines:

- translation count,
- rarity of the candidate globally,
- path score if available,
- a small language-resource boost.

The function is `score_translations(candidates, lang_code, weights)`.

The score is approximated by:

$$
S_{tr}(c) = w_{tc}T_c + w_r R_c + w_p P_c + w_{lb}L_c
$$

where:

- $T_c$ is a normalized translation count,
- $R_c$ is the rarity term,
- $P_c$ is the path score,
- $L_c$ is a low-resource language boost,
- weights default to approximately $(0.4, 0.25, 0.2, 0.15)$.

The rarity term is computed from frequency in a way that treats low-frequency forms as more interesting:

$$
R_c = 1 - \tanh(\log(1 + f_c))
$$

where $f_c$ is a global frequency proxy. This produces larger values for rarer entries.

### 8.2 Etymology root scoring

Etymology root candidates are scored using:

- the number of supporting paths,
- average path score,
- whether the candidate looks proto-like,
- rarity.

The function is `score_roots(candidates, lang_code, weights)`.

The rough formula is:

$$
S_{root}(c) = w_s S_p + w_{path}P_c + w_{proto}Q_c + w_r R_c
$$

where:

- $S_p$ is a normalized supporting-path count,
- $P_c$ is the average path score,
- $Q_c \in \{0,1\}$ indicates a proto-form marker,
- $R_c$ is the rarity term.

This makes sense because historical roots are often more interesting when they have multiple converging linguistic paths or explicit proto-form evidence.

### 8.3 Descendant scoring

The descendant layer combines:

- subtree size or descendant breadth,
- path score,
- rarity,
- shallow-depth preference.

The function is `score_descendants(candidates, lang_code, weights)`.

A representative score is:

$$
S_{desc}(c) = w_d D_c + w_p P_c + w_r R_c + w_{depth}B_c
$$

where:

- $D_c$ is a normalized descendant breadth metric,
- $P_c$ is the path score,
- $R_c$ is the rarity term,
- $B_c = 1 - \frac{\text{depth}}{\text{max\_depth}}$ is a shallow-depth preference term.

This favors candidates that are both structurally connected and not overly deep in a noisy tree.

---

## 9. Interpretation and explainability

A major requirement for the recommendation system is interpretability. Each item in the output includes:

- `score`: final final rank value in $[0,1]$,
- `features`: a dictionary of feature contribution values,
- `explanation`: a human-readable phrase summarizing the dominant drivers.

This is implemented by `_explain_from_contribs(cand, contribs)` in [backend/services/recommendation.py](../backend/services/recommendation.py). The explanation is generated from the largest contributors rather than from the full raw feature vector. For example:

- “rare globally (+20%)”
- “broad descendant subtree (+35%)”
- “strong path interest (+10%)”
- “shallow depth preferred”

This makes the recommendation useful not only as a ranking but also as a transparent signal for the UI and for human review.

The design deliberately favors simple explanations over opaque model internals. In other words, the system is explainable because each score can be decomposed into a small, conceptually meaningful set of contributions.

---

## 10. Processing pipeline

The complete process for a query word and language is as follows.

### Step 1: candidate extraction

The system identifies translation, root, and descendant candidates from the relevant data fields in the selected entry and associated graph structures.

### Step 2: feature extraction

Each candidate receives a set of features such as counts, rarity proxies, depth, path score, and supporting-path counts.

### Step 3: per-language normalization

Counts are compressed with log transforms and optionally converted using percentile approximations from `language_stats.json`.

### Step 4: path propagation

For descendant and root candidates, the system traverses the relevant graph or tree and computes decay-weighted path scores using node-interest values.

### Step 5: weighted ranking

Each layer uses a separate deterministic weight vector to combine features into a final score.

### Step 6: explanation generation

The top feature contributions are summarized into compact human-readable language.

### Step 7: JSON response

The endpoint returns a payload like:

```json
{
  "query": { "word": "water", "lang_code": "en" },
  "translations": [],
  "etymology_roots": [],
  "descendants": [
    {
      "word": "wataa",
      "lang_code": "djk",
      "score": 0.74,
      "features": {
        "desc_count": 0.35,
        "path": 0.10,
        "rarity": 0.20,
        "depth": 0.08
      },
      "explanation": "broad descendant subtree (+35%), rare globally (+20%)"
    }
  ]
}
```

This output is intentionally structured for frontend consumption and for human auditability.

---

## 11. Implementation details in the codebase

The implementation is intentionally compact and transparent. The main logic is concentrated in a small number of functions:

- `node_interest_from_entry(entry)`
- `compute_candidate_path_scores(...)`
- `decay_weighted_score(values, decay)`
- `score_translations(...)`
- `score_roots(...)`
- `score_descendants(...)`
- `_explain_from_contribs(cand, contribs)`

The endpoint `inspire_me(...)` in [backend/api_routes/word_data.py](../backend/api_routes/word_data.py) assembles the three layers and returns a JSON payload. It is deliberately kept separate from the scoring logic so that the ranking rules are easy to test and reason about.

The design also intentionally avoids importing FastAPI-specific route internals into the scoring module. When path-building needs to traverse the reverse graph, the scoring module reads the JSON data directly rather than depending on route-layer helpers. This makes the ranking logic portable, testable, and easier to unit-test outside the running API server.

---

## 12. Why this approach is appropriate

This recommendation system is suitable for a thesis or research prototype because it satisfies several important properties:

- it is deterministic,
- it is interpretable,
- it requires no training data,
- it is resilient to sparse and irregular data,
- it produces a continuous ranking instead of a brittle hard threshold,
- it remains comprehensible to both engineers and non-expert users.

The important conceptual move is to treat the data itself as the source of structure and to turn that structure into a transparent score. Rather than asking a model to infer what “interesting” means from behavior, the system directly encodes a set of linguistic priors that are easy to inspect and reason about.

---

## 13. Limitations and future work

The current prototype is intentionally simple, and its limitations are clear:

- `global_freq` is still a rough proxy rather than a true corpus-wide frequency estimate,
- language-specific quantiles are only partially used and could be expanded,
- descendant graphs are expensive to traverse and may benefit from more aggressive caching,
- translation candidate extraction can still be noisy when template structures are irregular,
- diversity among top results is not yet enforced.

Future extensions may include:

- richer precomputed frequency tables,
- more precise per-language normalization using full stats and quantiles,
- diversity-aware ranking using MMR or a constrained top-k stage,
- stronger propagation from reverse descendant graphs and subtree sampling,
- optional model-based ranking layered on top of the same feature explanations.

These are additional refinements rather than a conceptual replacement of the current deterministic system.

---

## 14. Summary

The recommendation system is a transparent, deterministic ranking engine built around a small set of interpretable features and decay-weighted structural signals. It avoids machine learning while still producing useful, explainable, and fair recommendations. Its design is intentionally modular: candidate extraction, feature calculation, path scoring, weighted ranking, and explanation generation are all separate concerns.

This makes the system well-suited for a thesis context, where the objective is not merely to produce a recommendation, but to justify the ranking choices in human-understandable terms and to show how linguistic structure can be turned into a stable scoring function without training data.
