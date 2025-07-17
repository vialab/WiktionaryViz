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
                    const timeline: NodeData[] = result.ancestry_chain.map((entry: AncestryChainEntry & { drift?: number }) => {
                        let dataQuality: 'complete' | 'partial-ai' | 'full-ai' = 'complete';
                        // AI transparency logic:
                        // - If IPA is present and not estimated, 'complete'
                        // - If IPA is present and estimated, but phonemic IPA was available, 'partial-ai'
                        // - If IPA is present and estimated, and no phonemic IPA, 'full-ai'
                        // - If no IPA, fallback to 'full-ai'
                        const hasPhonemic = !!entry.phonemic_ipa;
                        const aiIpa = entry.node && entry.node.ai_estimated_ipa;
                        const isAIPhonetic = !!aiIpa && entry.ipa === aiIpa;
                        const hasPhonetic = !!entry.ipa && (!isAIPhonetic);
                        if (isAIPhonetic && hasPhonemic) {
                            dataQuality = 'partial-ai';
                        } else if (isAIPhonetic && !hasPhonemic) {
                            dataQuality = 'full-ai';
                        } else if (hasPhonetic) {
                            dataQuality = 'complete';
                        } else if (!entry.ipa) {
                            dataQuality = 'full-ai';
                        }
                        return {
                            language: entry.lang_code,
                            drift: entry.drift ?? 0,
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
