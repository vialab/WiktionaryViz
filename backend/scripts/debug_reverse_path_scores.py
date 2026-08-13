import json, unicodedata
from constants import REVERSE_DESCENDANT_GRAPH_FILE_PATH, JSONL_FILE_PATH, index
import mmap, os
from services.recommendation import node_interest_from_entry, _read_entry, decay_weighted_score, _log1p


def normalize(s):
    return str(s).strip().lower() if s else ''


def index_word_variants(text):
    raw = normalize(text)
    if not raw:
        return []
    variants = [raw]
    base = raw.lstrip('*')
    if base and base != raw:
        variants.append(base)
    stripped = ''.join(ch for ch in unicodedata.normalize('NFKD', base) if unicodedata.category(ch) != 'Mn')
    if stripped and stripped not in variants:
        variants.append(stripped)
    if base.startswith('reconstruction:'):
        bare = base[len('reconstruction:'):].strip()
        if bare and bare not in variants:
            variants.append(bare)
    return variants


def lang_variants(lang_code):
    normalized = normalize(lang_code)
    if not normalized:
        return ['']
    variants = [normalized]
    if '-' in normalized:
        parts = normalized.split('-')
        for end in range(len(parts)-1,0,-1):
            prefix = '-'.join(parts[:end])
            if prefix not in variants:
                variants.append(prefix)
    return variants


def graph_key_variants(word, lang_code):
    keys = []
    for w in index_word_variants(word):
        for l in lang_variants(lang_code):
            key = f"{w}_{l}" if l else w
            if key not in keys:
                keys.append(key)
    return keys


def build_reverse_tree(graph, root_key, max_depth=6):
    seen = set()

    def build(key, depth):
        if depth >= max_depth:
            if '_' in key:
                w, l = key.split('_', 1)
            else:
                w, l = key, None
            return {'word': w, 'lang_code': l, 'children': []}
        children = []
        for child_key in sorted(graph.get(key, [])):
            if child_key in seen:
                continue
            seen.add(child_key)
            children.append(build(child_key, depth+1))
        if '_' in key:
            w, l = key.split('_', 1)
        else:
            w, l = key, None
        return {'word': w, 'lang_code': l, 'children': children}

    return build(root_key, 0)


def flatten_paths(tree, root_word, root_lang, max_paths=2000):
    paths = []

    def walk(node, acc):
        cur = {'word': node.get('word'), 'lang_code': node.get('lang_code')}
        new_acc = acc + [cur]
        children = node.get('children', []) or []
        if not children:
            paths.append(new_acc)
            return
        for c in children:
            walk(c, new_acc)

    top_children = tree.get('children', []) if isinstance(tree, dict) else []
    root_node = {'word': root_word, 'lang_code': root_lang}
    if top_children:
        for child in top_children:
            if len(paths) >= max_paths:
                break
            walk(child, [root_node])
    else:
        paths.append([root_node])
    return paths


def build_subtree_counts(node, counts):
    children = node.get('children', []) or []
    total = 1
    for c in children:
        total += build_subtree_counts(c, counts)
    w = (node.get('word') or '').strip()
    l = (node.get('lang_code') or '').strip().lower() if node.get('lang_code') else ''
    keyname = f"{w.lower()}_{l}".rstrip('_')
    counts[keyname] = max(0, total - 1)
    return total


def estimate_interest_from_subcount(sc):
    sc = float(sc)
    if sc <= 0:
        return 0.0
    v = _log1p(sc)
    return min(1.0, v / (1.0 + v) * 0.9)


def main():
    with open(REVERSE_DESCENDANT_GRAPH_FILE_PATH, 'r', encoding='utf-8') as f:
        graph = json.load(f)

    root = 'water'
    lang = 'en'
    keys = graph_key_variants(root, lang)
    sel = None
    for k in keys:
        if graph.get(k):
            sel = k
            break
    if not sel:
        print('no reverse key found')
        return
    print('selected root key', sel)

    tree = build_reverse_tree(graph, sel, max_depth=6)
    paths = flatten_paths(tree, root, lang, max_paths=2000)
    print('num paths', len(paths))

    counts = {}
    build_subtree_counts({'word': root, 'lang_code': lang, 'children': tree.get('children', [])}, counts)

    # collect candidates as earlier
    candidates = []
    seen = set()
    for child_key in sorted(graph.get(sel, [])):
        if child_key in seen:
            continue
        seen.add(child_key)
        if '_' in child_key:
            child_word, child_lang = child_key.rsplit('_', 1)
        else:
            child_word, child_lang = child_key, None
        candidates.append({'word': child_word, 'lang_code': child_lang, 'key': child_key})

    # compute interests per node for each path
    scores = { (f"{(c['word'] or '').strip().lower()}_{(c['lang_code'] or '').strip().lower()}".rstrip('_')): 0.0 for c in candidates }

    for p in paths:
        node_pairs = [(n.get('word') or '').strip() for n in p]
        interests = []
        for wnode in p:
            w = (wnode.get('word') or '').strip()
            l = (wnode.get('lang_code') or '').strip().lower() if wnode.get('lang_code') else None
            ent = _read_entry(w, l)
            if ent:
                interests.append(node_interest_from_entry(ent))
            else:
                keyname = f"{w.lower()}_{(l or '')}".rstrip('_')
                sc = counts.get(keyname, 0)
                interests.append(estimate_interest_from_subcount(sc))

        for idx, (wnode) in enumerate(p):
            w = (wnode.get('word') or '').strip()
            l = (wnode.get('lang_code') or '').strip().lower() if wnode.get('lang_code') else ''
            key = f"{w.lower()}_{l}".rstrip('_')
            if key not in scores:
                continue
            rev = [interests[idx - i] for i in range(idx + 1)]
            s = decay_weighted_score(rev, decay=0.85)
            scores[key] = max(scores.get(key, 0.0), s)

    print('computed path scores (nonzero):')
    for k, v in sorted(scores.items(), key=lambda kv: kv[1], reverse=True):
        if v > 0:
            print(k, v)


if __name__ == '__main__':
    main()
