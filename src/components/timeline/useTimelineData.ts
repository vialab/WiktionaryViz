import { useEffect, useState } from 'react';

export interface NodeData {
    language: string;
    drift: number;
    tooltip: string;
}

export interface AlignmentDiff {
    from?: string;
    to?: string;
    changes?: Record<string, string>;
    status?: string;
}

export interface EtymologyTreeNode {
    word: string;
    lang?: string;
    lang_code: string;
    sounds?: { ipa?: string }[];
    ai_estimated_ipa?: string;
    etymology_children?: {
        word: string;
        lang_code: string;
        data: EtymologyTreeNode;
        phonetic_drift?: { alignment?: AlignmentDiff[] };
    }[];
    phonetic_drift?: { alignment?: AlignmentDiff[] };
}

/**
 * Custom hook to fetch and process timeline data for the phonetic drift timeline using the new backend API.
 * @param word - The target word
 * @param language - The target language
 */
export function useTimelineData(word: string, language: string) {
    const [data, setData] = useState<NodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        function flattenTree(node: EtymologyTreeNode, parentIPA: string | null = null, acc: NodeData[] = []): NodeData[] {
            const langLabel = node.lang ? `${node.lang} (${node.lang_code})` : node.lang_code;
            let ipa = null;
            if (Array.isArray(node.sounds) && node.sounds.length > 0 && node.sounds[0].ipa) {
                ipa = node.sounds[0].ipa;
            } else if (node.ai_estimated_ipa) {
                ipa = node.ai_estimated_ipa;
            }
            let drift = 0;
            let tooltip = `${node.word} (${node.lang || ''} - ${node.lang_code})\nIPA: ${ipa || 'N/A'}`;
            if (parentIPA && ipa && node.phonetic_drift) {
                drift = Array.isArray(node.phonetic_drift.alignment)
                    ? node.phonetic_drift.alignment.filter((d: { changes?: Record<string, string>; status?: string }) => d.changes || d.status === 'deletion' || d.status === 'insertion').length
                    : 0;
                tooltip += `\nPhonetic drift from parent:`;
                for (const diff of node.phonetic_drift.alignment || []) {
                    if (diff.changes) {
                        tooltip += `\n  ${diff.from} → ${diff.to} | ${Object.keys(diff.changes).length} feature diffs`;
                    } else if (diff.status === 'deletion') {
                        tooltip += `\n  ${diff.from} → ∅ | deletion`;
                    } else if (diff.status === 'insertion') {
                        tooltip += `\n  ∅ → ${diff.to} | insertion`;
                    }
                }
            }
            acc.push({ language: langLabel, drift, tooltip });
            if (Array.isArray(node.etymology_children) && node.etymology_children.length > 0) {
                for (const child of node.etymology_children) {
                    flattenTree({ ...child.data, phonetic_drift: child.phonetic_drift }, ipa, acc);
                }
            }
            return acc;
        }
        async function fetchTimeline() {
            setLoading(true);
            setError(null);
            setData([]);
            try {
                const res = await fetch(`http://localhost:8000/word-etymology-tree?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`);
                if (!res.ok) throw new Error('Failed to fetch etymology tree');
                const tree: EtymologyTreeNode = await res.json();
                const timeline = flattenTree(tree);
                setData(timeline);
            } catch (err) {
                if (err instanceof Error) setError(err.message);
                else setError('Unknown error');
                setData([]);
            } finally {
                setLoading(false);
            }
        }
        if (word && language) fetchTimeline();
    }, [word, language]);

    return { data, loading, error };
}
