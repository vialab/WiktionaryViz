import { useEffect, useState } from 'react';

export interface NodeData {
    language: string;
    drift: number;
    tooltip: string;
    word: string;
    lang_code: string;
    pronunciation?: string;
    dataQuality: 'complete' | 'partial-ai' | 'full-ai';
}

/**
 * Custom hook to fetch and process timeline data for the phonetic drift timeline using the word-data API and etymology_templates.
 * @param word - The target word
 * @param language - The target language
 */
interface AncestryChainEntry {
    phonemic_ipa: any;
    word: string;
    lang_code: string;
    ipa?: string;
    node?: any;
}

export function useTimelineData(word: string, language: string) {
    const [data, setData] = useState<NodeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchTimelineFromAncestryChain() {
            setLoading(true);
            setError(null);
            setData([]);
            try {
                const res = await fetch(`http://localhost:8000/ancestry-chain?word=${encodeURIComponent(word)}&lang_code=${encodeURIComponent(language)}`);
                if (!res.ok) throw new Error('Failed to fetch ancestry chain');
                const result = await res.json();
                if (result.ancestry_chain && Array.isArray(result.ancestry_chain)) {
                    const timeline: NodeData[] = result.ancestry_chain.map((entry: AncestryChainEntry) => {
                        let dataQuality: 'complete' | 'partial-ai' | 'full-ai' = 'complete';
                        const hasPhonemic = !!entry.phonemic_ipa;
                        const hasPhonetic = !!entry.ipa && (!entry.node || !entry.node.ai_estimated_ipa);
                        const isAIPhonetic = !!entry.ipa && entry.node && entry.node.ai_estimated_ipa;
                        if (isAIPhonetic && hasPhonemic) {
                            // Had only phonemic IPA, so AI was used for phonetic
                            dataQuality = 'partial-ai';
                        } else if (isAIPhonetic && !hasPhonemic) {
                            // No IPA at all, fully AI estimated
                            dataQuality = 'full-ai';
                        } else if (hasPhonetic) {
                            // IPA was present and not estimated
                            dataQuality = 'complete';
                        }
                        return {
                            language: entry.lang_code,
                            drift: 0,
                            tooltip: `${entry.word} (${entry.lang_code})\nIPA: ${entry.ipa || 'N/A'}`,
                            word: entry.word,
                            lang_code: entry.lang_code,
                            pronunciation: entry.ipa || '',
                            dataQuality
                        };
                    });
                    setData(timeline);
                } else {
                    setData([]);
                }
            } catch (err) {
                if (err instanceof Error) setError(err.message);
                else setError('Unknown error');
                setData([]);
            } finally {
                setLoading(false);
            }
        }
        if (word && language) fetchTimelineFromAncestryChain();
    }, [word, language]);

    return { data, loading, error };
}
